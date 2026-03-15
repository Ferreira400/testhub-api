/**
 * src/services/bugService.js
 * Ciclo completo de Bug: TestHub -> Jira -> Retest
 */

const db                  = require('../config/db');
const { v4: uuid }        = require('uuid');
const jiraService         = require('./jiraService');
const notificationService = require('./notificationService');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const JIRA_URL     = process.env.JIRA_URL     || '';

// ── Criar Bug no Jira a partir de uma execução failed ─────────

async function createBugFromExecution(executionId) {
  // Busca execução completa
  const [execs] = await db.execute(`
    SELECT e.*,
      tc.title AS case_title, tc.code AS case_code,
      tc.priority, tc.jira_key AS story_key,
      tc.description AS case_description,
      cy.name AS cycle_name,
      s.name AS squad_name,
      u.name AS executed_by_name, u.email AS executed_by_email
    FROM test_executions e
    JOIN test_cases tc ON tc.id = e.test_case_id
    JOIN test_cycles cy ON cy.id = e.cycle_id
    JOIN squads s ON s.id = e.squad_id
    JOIN users u ON u.id = e.executed_by
    WHERE e.id = ?
  `, [executionId]);

  if (!execs.length) throw new Error('Execução não encontrada');
  const exec = execs[0];

  if (exec.status !== 'failed') throw new Error('Apenas execuções com status "failed" podem gerar bugs');
  if (exec.jira_bug_key) throw new Error(`Bug já criado: ${exec.jira_bug_key}`);

  // Cria bug no Jira
  const bugSummary = `[BUG] ${exec.case_code} — ${exec.case_title}`;
  const bugDescription =
    `*Caso de Teste:* ${exec.case_code} — ${exec.case_title}\n` +
    `*Ciclo:* ${exec.cycle_name}\n` +
    `*Squad:* ${exec.squad_name}\n` +
    `*Executado por:* ${exec.executed_by_name}\n` +
    `*Prioridade:* ${exec.priority}\n\n` +
    `*Comentários da execução:*\n${exec.comments || 'Sem comentários'}\n\n` +
    `*Ver execução no TestHub:* ${FRONTEND_URL}/executions/${executionId}`;

  const bug = await jiraService.createIssue({
    summary:     bugSummary,
    description: bugDescription,
    issueType:   'Bug',
    parentKey:   exec.story_key || undefined,
    labels:      ['testhub-auto', 'qa-failure', `squad-${exec.squad_name?.toLowerCase().replace(/\s+/g,'-')}`],
  });

  // Salva vínculo no banco
  const bugLinkId = uuid();
  await db.execute(
    `INSERT INTO bug_links (id, jira_bug_key, jira_story_key, test_case_id, execution_id, cycle_id, squad_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open')`,
    [bugLinkId, bug.key, exec.story_key || null, exec.test_case_id, executionId, exec.cycle_id, exec.squad_id]
  );

  // Atualiza execução com key do bug
  await db.execute(
    'UPDATE test_executions SET jira_bug_key = ?, jira_bug_url = ? WHERE id = ?',
    [bug.key, `${JIRA_URL}/browse/${bug.key}`, executionId]
  );

  // Adiciona comentário na Story original (se vinculada)
  if (exec.story_key) {
    await jiraService.addComment(exec.story_key,
      `🔴 Bug criado automaticamente pelo TestHub\nCaso: ${exec.case_code} — ${exec.case_title}\nBug: ${bug.key}\nVer execução: ${FRONTEND_URL}/executions/${executionId}`
    );
  }

  // Notifica squad no Teams
  await notifyBugCreated({ exec, bugKey: bug.key, executionId });

  console.log(`[BUG] Bug ${bug.key} criado para execução ${executionId}`);
  return { bugKey: bug.key, bugUrl: `${JIRA_URL}/browse/${bug.key}`, bugLinkId };
}

// ── Processar bug resolvido (chamado pelo webhook do Jira) ─────

async function processBugResolved(jiraBugKey, jiraStatus) {
  const resolvedStatuses = ['done', 'fixed', 'resolved', 'closed'];
  const isResolved = resolvedStatuses.some(s => jiraStatus.toLowerCase().includes(s));
  if (!isResolved) return;

  // Busca vínculo
  const [links] = await db.execute(`
    SELECT bl.*,
      tc.title AS case_title, tc.code AS case_code,
      cy.name AS cycle_name,
      s.name AS squad_name
    FROM bug_links bl
    JOIN test_cases tc ON tc.id = bl.test_case_id
    JOIN test_cycles cy ON cy.id = bl.cycle_id
    JOIN squads s ON s.id = bl.squad_id
    WHERE bl.jira_bug_key = ? AND bl.status = 'open'
  `, [jiraBugKey]);

  if (!links.length) return;
  const link = links[0];

  console.log(`[BUG] Bug ${jiraBugKey} resolvido — processando retest...`);

  // 1. Atualiza status do bug link
  await db.execute(
    'UPDATE bug_links SET status = "retest_pending", resolved_at = NOW() WHERE jira_bug_key = ?',
    [jiraBugKey]
  );

  // 2. Cria nova execução not_run no mesmo ciclo para retest
  const retestId = uuid();
  const [dbUsers] = await db.execute('SELECT id FROM users LIMIT 1');
  const userId = dbUsers[0]?.id;

  await db.execute(
    `INSERT INTO test_executions
     (id, cycle_id, test_case_id, executed_by, squad_id, status, execution_type, comments, started_at, finished_at, retest_reason)
     VALUES (?, ?, ?, ?, ?, 'not_run', 'manual', ?, NOW(), NOW(), ?)`,
    [retestId, link.cycle_id, link.test_case_id, userId, link.squad_id,
     `Retest solicitado — Bug ${jiraBugKey} resolvido no Jira`,
     `Bug ${jiraBugKey} marcado como resolvido. Retest necessário.`]
  );

  // Atualiza bug link com ID do retest
  await db.execute(
    'UPDATE bug_links SET retest_execution_id = ? WHERE jira_bug_key = ?',
    [retestId, jiraBugKey]
  );

  // 3. Atualiza execução original
  await db.execute(
    'UPDATE test_executions SET retest_requested_at = NOW() WHERE jira_bug_key = ?',
    [jiraBugKey]
  );

  // 4. Notifica todos da squad
  await notifyRetestRequired({ link, jiraBugKey, retestId });

  console.log(`[BUG] Retest ${retestId} criado para bug ${jiraBugKey}`);
  return { retestId, bugKey: jiraBugKey };
}

// ── Notificações ──────────────────────────────────────────────

async function notifyBugCreated({ exec, bugKey, executionId }) {
  if (!process.env.TEAMS_WEBHOOK_URL) return;
  try {
    await notificationService.sendTeamsCard({
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard', version: '1.4',
          body: [
            { type:'Container', style:'attention', items:[{
              type:'TextBlock', text:'🐛 Bug Criado Automaticamente',
              weight:'Bolder', size:'Medium', color:'Attention'
            }]},
            { type:'FactSet', facts:[
              { title:'Bug',      value:`**${bugKey}**` },
              { title:'Caso',     value:`${exec.case_code} — ${exec.case_title}` },
              { title:'Ciclo',    value: exec.cycle_name },
              { title:'Squad',    value: exec.squad_name },
              { title:'Execução', value: exec.executed_by_name },
              { title:'Prioridade', value: exec.priority?.toUpperCase() },
            ]},
            { type:'TextBlock', text:'O caso de teste falhou e um bug foi aberto automaticamente no Jira.', wrap:true },
          ],
          actions:[
            { type:'Action.OpenUrl', title:'🐛 Ver Bug no Jira',    url:`${JIRA_URL}/browse/${bugKey}` },
            { type:'Action.OpenUrl', title:'🔍 Ver Execução',        url:`${FRONTEND_URL}/executions/${executionId}` },
          ]
        }
      }]
    });
  } catch(e) { console.warn('[BUG] Teams notify failed:', e.message); }

  // Email para todos da squad
  try {
    const emails = await getSquadEmails(exec.squad_id);
    if (emails.length) {
      await notificationService.sendEmail({
        to: emails,
        subject: `[TestHub] 🐛 Bug ${bugKey} — ${exec.case_title}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px">
            <div style="background:#f43f5e;color:#fff;padding:20px;border-radius:8px 8px 0 0">
              <h2 style="margin:0">🐛 Bug Criado Automaticamente</h2>
            </div>
            <div style="background:#f8f9fa;padding:20px;border-radius:0 0 8px 8px">
              <p><strong>Bug:</strong> <a href="${JIRA_URL}/browse/${bugKey}">${bugKey}</a></p>
              <p><strong>Caso:</strong> ${exec.case_code} — ${exec.case_title}</p>
              <p><strong>Ciclo:</strong> ${exec.cycle_name}</p>
              <p><strong>Squad:</strong> ${exec.squad_name}</p>
              <p><strong>Comentários:</strong> ${exec.comments || 'Sem comentários'}</p>
              <a href="${FRONTEND_URL}/executions/${executionId}"
                 style="display:inline-block;background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:10px">
                Ver Execução no TestHub
              </a>
            </div>
          </div>
        `
      });
    }
  } catch(e) { console.warn('[BUG] Email notify failed:', e.message); }
}

async function notifyRetestRequired({ link, jiraBugKey, retestId }) {
  if (!process.env.TEAMS_WEBHOOK_URL) return;
  try {
    await notificationService.sendTeamsCard({
      type: 'message',
      attachments: [{
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard', version: '1.4',
          body: [
            { type:'Container', style:'good', items:[{
              type:'TextBlock', text:'✅ Bug Resolvido — Retest Necessário!',
              weight:'Bolder', size:'Medium', color:'Good'
            }]},
            { type:'FactSet', facts:[
              { title:'Bug',   value:`**${jiraBugKey}** — Resolvido` },
              { title:'Caso',  value:`${link.case_code} — ${link.case_title}` },
              { title:'Ciclo', value: link.cycle_name },
              { title:'Squad', value: link.squad_name },
            ]},
            { type:'TextBlock', text:'O bug foi resolvido pelo time de desenvolvimento. Uma nova execução foi criada para retest.', wrap:true, color:'Good' },
          ],
          actions:[
            { type:'Action.OpenUrl', title:'🔄 Executar Retest',     url:`${FRONTEND_URL}/executions?retest=${retestId}` },
            { type:'Action.OpenUrl', title:'🐛 Ver Bug no Jira',      url:`${JIRA_URL}/browse/${jiraBugKey}` },
          ]
        }
      }]
    });
  } catch(e) { console.warn('[BUG] Teams retest notify failed:', e.message); }

  // Email
  try {
    const emails = await getSquadEmails(link.squad_id);
    if (emails.length) {
      await notificationService.sendEmail({
        to: emails,
        subject: `[TestHub] ✅ Retest necessário — Bug ${jiraBugKey} resolvido`,
        html: `
          <div style="font-family:sans-serif;max-width:600px">
            <div style="background:#22c55e;color:#fff;padding:20px;border-radius:8px 8px 0 0">
              <h2 style="margin:0">✅ Bug Resolvido — Retest Necessário</h2>
            </div>
            <div style="background:#f8f9fa;padding:20px;border-radius:0 0 8px 8px">
              <p><strong>Bug:</strong> <a href="${JIRA_URL}/browse/${jiraBugKey}">${jiraBugKey}</a> — Resolvido</p>
              <p><strong>Caso:</strong> ${link.case_code} — ${link.case_title}</p>
              <p><strong>Ciclo:</strong> ${link.cycle_name}</p>
              <p>Uma nova execução foi criada automaticamente para retest.</p>
              <a href="${FRONTEND_URL}/executions?retest=${retestId}"
                 style="display:inline-block;background:#22c55e;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:10px">
                Executar Retest
              </a>
            </div>
          </div>
        `
      });
    }
  } catch(e) { console.warn('[BUG] Email retest notify failed:', e.message); }
}

async function getSquadEmails(squadId) {
  if (!squadId) return [];
  const [rows] = await db.execute(
    `SELECT u.email FROM users u JOIN squad_members sm ON u.id = sm.user_id WHERE sm.squad_id = ?`,
    [squadId]
  );
  return rows.map(r => r.email);
}

// ── Listar bugs ───────────────────────────────────────────────

async function listBugs({ squadId, cycleId, status } = {}) {
  let sql = `
    SELECT bl.*,
      tc.title AS case_title, tc.code AS case_code, tc.priority,
      cy.name AS cycle_name, s.name AS squad_name,
      e.comments AS execution_comments,
      e.executed_by AS executed_by_id
    FROM bug_links bl
    JOIN test_cases tc ON tc.id = bl.test_case_id
    JOIN test_cycles cy ON cy.id = bl.cycle_id
    JOIN squads s ON s.id = bl.squad_id
    LEFT JOIN test_executions e ON e.id = bl.execution_id
    WHERE 1=1
  `;
  const params = [];
  if (squadId) { sql += ' AND bl.squad_id = ?'; params.push(squadId); }
  if (cycleId) { sql += ' AND bl.cycle_id = ?'; params.push(cycleId); }
  if (status)  { sql += ' AND bl.status = ?';   params.push(status); }
  sql += ' ORDER BY bl.created_at DESC';
  const [rows] = await db.execute(sql, params);
  return rows;
}

module.exports = { createBugFromExecution, processBugResolved, listBugs };
