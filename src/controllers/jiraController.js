/**
 * src/controllers/jiraController.js
 */

const db                  = require('../config/db');
const jiraService         = require('../services/jiraService');
const gherkinService      = require('../services/gherkinService');
const notificationService = require('../services/notificationService');
const { v4: uuid }        = require('uuid');

async function handleWebhook(req, res) {
  res.status(200).json({ received: true });
  console.log('[JIRA WEBHOOK] Received payload:', JSON.stringify(req.body, null, 2));

  const { webhookEvent, issue } = req.body;
  if (!issue) return;

  const key         = (issue.key || '').trim();
  const issueType   = issue.fields?.issuetype?.name;
  const summary     = issue.fields?.summary || '';
  const description = extractDescription(issue.fields?.description);
  const acceptance  = issue.fields?.customfield_10016 || '';

  try {
    if (webhookEvent === 'jira:issue_created' && issueType === 'Story') {
      await handleStoryCreated({ key, summary, description, acceptance });
    }
    if (webhookEvent === 'jira:issue_updated') {
        if (webhookEvent === 'jira:issue_updated') {
  // Verifica se é um Bug sendo resolvido
  if (issueType === 'Bug') {
    const status = issue.fields?.status?.name || '';
    const { handleBugResolved } = require('./bugController');
    await handleBugResolved(key, status);
    return;
  }
  await handleStoryUpdated({ key, summary, description, issue });
}


      await handleStoryUpdated({ key, summary, issue });
    }
    if (webhookEvent === 'jira:issue_deleted') {
      await handleStoryDeleted(key);
    }
  } catch (err) {
    console.error(`[JIRA WEBHOOK] Erro processando ${JSON.stringify(key)}:`, err.message);
    console.error(err.stack || err);
  }
}

async function getDefaultCreatedBy() {
  const [users] = await db.execute('SELECT id FROM users LIMIT 1');
  if (users.length) return users[0].id;
  throw new Error('Nenhum usuario cadastrado.');
}

async function handleStoryCreated({ key, summary, description, acceptance }) {
  console.log(`[JIRA] Story criada: ${key} — ${summary}`);

  const [projects] = await db.execute('SELECT id FROM projects LIMIT 1');
  const [squads]   = await db.execute('SELECT id, name FROM squads LIMIT 1');
  if (!projects.length) { console.warn('[JIRA] Nenhum projeto encontrado'); return; }

  const projectId = projects[0].id;
  const squadId   = squads[0]?.id;
  const squadName = squads[0]?.name;

  console.log(`[JIRA] Gerando Gherkin para ${key}...`);
  const gherkinJson = await gherkinService.generateGherkin({ summary, description, acceptanceCriteria: acceptance });
  const testCases   = gherkinService.gherkinToTestCases({ gherkinJson, projectId, squadId, jiraKey: key });

  const caseIds   = [];
  const createdBy = await getDefaultCreatedBy();

  for (const tc of testCases) {
    const id = uuid();
    try {
      const descText = (tc.gherkin_text || '').slice(0, 3000);
      await db.execute(
        `INSERT INTO test_cases
           (id, title, description, preconditions, priority, automation_status, project_id, status, created_by, jira_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tc.title, descText, tc.preconditions || '', tc.priority || 'medium', 'not_automated', projectId, 'draft', createdBy, key]
      );
      console.log(`[JIRA] ✅ Caso inserido: ${tc.title}`);
      caseIds.push(id);

      for (const step of (tc.steps || [])) {
        await db.execute(
          'INSERT INTO test_steps (id, test_case_id, step_order, action, expected_result) VALUES (?, ?, ?, ?, ?)',
          [uuid(), id, step.order, (step.action || '').slice(0, 500), (step.expected_result || '').slice(0, 500)]
        );
      }
    } catch (e) {
      console.error(`[JIRA] ❌ ERRO ao inserir caso: ${e.message}`);
    }
  }

  await db.execute(
    `INSERT INTO jira_links (id, jira_key, jira_summary, project_id, squad_id, gherkin_generated, created_at)
     VALUES (?, ?, ?, ?, ?, 1, NOW())
     ON DUPLICATE KEY UPDATE jira_summary=VALUES(jira_summary), gherkin_generated=1`,
    [uuid(), key, summary, projectId, squadId]
  );

  const emails = await getSquadEmails(squadId);
  await notificationService.notifyNewStory({ jiraKey: key, summary, scenariosCount: testCases.length, testCaseIds: caseIds, squadName });
  if (emails.length) {
    await notificationService.emailNewStory({ to: emails, jiraKey: key, summary, scenariosCount: testCases.length });
  }

  (async () => {
    try {
      console.log(`[JIRA BACKGROUND] Aguardando 30s para atualizar ${key}...`);
      await new Promise(r => setTimeout(r, 30000));
      await jiraService.setTestHubFields(key, { gherkinGenerated: true });
      await jiraService.addComment(key,
        `TestHub gerou ${caseIds.length} cenarios de teste automaticamente.\nVer em: ${process.env.FRONTEND_URL}/test-cases?jira=${key}`
      );
      console.log(`[JIRA BACKGROUND] ✅ ${key} atualizado`);
    } catch (err) {
      console.error(`[JIRA BACKGROUND] ❌ Erro ao atualizar ${key}:`, err.message);
    }
  })();

  console.log(`[JIRA] ${key}: ${caseIds.length} casos criados com sucesso`);
}

async function handleStoryUpdated({ key, summary }) {
  const [links] = await db.execute('SELECT * FROM jira_links WHERE jira_key = ?', [key]);
  if (!links.length) return;
  await db.execute('UPDATE jira_links SET jira_summary = ?, updated_at = NOW() WHERE jira_key = ?', [summary, key]);
  console.log(`[JIRA] Story atualizada: ${key}`);
}

async function handleStoryDeleted(key) {
  await db.execute(
    `UPDATE test_cases SET status = 'deprecated' WHERE jira_key = ? AND status != 'deprecated'`,
    [key]
  );
  await db.execute('UPDATE jira_links SET deleted_at = NOW() WHERE jira_key = ?', [key]);
  console.log(`[JIRA] Story deletada: ${key} — casos deprecados`);
}

async function syncExecutionToJira(req, res) {
  const { executionId } = req.params;
  try {
    const [execs] = await db.execute(
      `SELECT e.*, tc.title as case_title, tc.jira_key as jira_key
       FROM test_executions e
       JOIN test_cases tc ON e.test_case_id = tc.id
       WHERE e.id = ?`,
      [executionId]
    );
    if (!execs.length) return res.status(404).json({ error: 'Execucao nao encontrada' });

    const exec    = execs[0];
    const jiraKey = exec.jira_key;
    if (!jiraKey) return res.status(400).json({ error: 'Caso nao vinculado ao Jira' });

    if (exec.status === 'failed') {
      const bug = await jiraService.createBugFromExecution({
        storyKey:     jiraKey,
        testCaseName: exec.case_title,
        executionId,
        error:        exec.comments,
      });
      return res.json({ ok: true, bug: bug.key });
    }

    await jiraService.addComment(jiraKey, `Caso "${exec.case_title}" passou no TestHub.`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function syncCycleToJira(req, res) {
  const { cycleId } = req.params;
  try {
    const [cycles] = await db.execute('SELECT * FROM test_cycles WHERE id = ?', [cycleId]);
    if (!cycles.length) return res.status(404).json({ error: 'Ciclo nao encontrado' });

    const [stats] = await db.execute(
      `SELECT status, COUNT(*) as total FROM test_executions WHERE cycle_id = ? GROUP BY status`,
      [cycleId]
    );

    const passed = Number(stats.find(s => s.status === 'passed')?.total || 0);
    const failed = Number(stats.find(s => s.status === 'failed')?.total || 0);
    const total  = stats.reduce((s, x) => s + Number(x.total), 0);

    const [links] = await db.execute(
      'SELECT jira_key FROM jira_links WHERE project_id = ? ORDER BY created_at DESC LIMIT 1',
      [cycles[0].project_id]
    );
    if (!links.length) return res.status(400).json({ error: 'Projeto nao vinculado ao Jira' });

    const [squads] = await db.execute('SELECT name FROM squads WHERE id = ?', [cycles[0].squad_id]);

    await jiraService.syncCycleResult({ storyKey: links[0].jira_key, cycleId, passed, failed, total });
    await notificationService.notifyCycleResult({
      jiraKey: links[0].jira_key, summary: cycles[0].name,
      passed, failed, total, cycleId, squadName: squads[0]?.name,
    });

    res.json({ ok: true, passed, failed, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function generateGherkinManual(req, res) {
  const { jiraKey } = req.params;
  try {
    const issue       = await jiraService.getIssue(jiraKey);
    const summary     = issue.fields.summary;
    const description = extractDescription(issue.fields.description);
    const gherkinJson = await gherkinService.generateGherkin({ summary, description });
    const gherkinText = gherkinService.toGherkinText(gherkinJson);
    res.json({ jiraKey, summary, gherkinJson, gherkinText, scenarios: gherkinJson.scenarios.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function listLinks(req, res) {
  const [rows] = await db.execute(
    `SELECT jl.*, p.name as project_name, s.name as squad_name
     FROM jira_links jl
     LEFT JOIN projects p ON jl.project_id = p.id
     LEFT JOIN squads s   ON jl.squad_id   = s.id
     WHERE jl.deleted_at IS NULL
     ORDER BY jl.created_at DESC`
  );
  res.json(rows);
}

function extractDescription(descField) {
  if (!descField) return '';
  if (typeof descField === 'string') return descField;
  try {
    return descField.content?.flatMap(b => b.content || [])?.filter(n => n.type === 'text')?.map(n => n.text)?.join(' ') || '';
  } catch { return ''; }
}

function extractJiraKey(text) {
  if (!text) return null;
  const match = text.match(/([A-Z]+-\d+)/);
  return match ? match[1] : null;
}

async function getSquadEmails(squadId) {
  if (!squadId) return [];
  const [rows] = await db.execute(
    `SELECT u.email FROM users u JOIN squad_members sm ON u.id = sm.user_id WHERE sm.squad_id = ?`,
    [squadId]
  );
  return rows.map(r => r.email);
}


async function saveCases(req, res) {
  const { jiraKey, summary, gherkinJson, projectId, squadId } = req.body;
  if (!jiraKey || !gherkinJson || !projectId) {
    return res.status(400).json({ error: 'jiraKey, gherkinJson e projectId sao obrigatorios' });
  }
  try {
    const createdBy = await getDefaultCreatedBy();
    const testCases = gherkinService.gherkinToTestCases({ gherkinJson, projectId, squadId, jiraKey });
    const caseIds   = [];

    for (const tc of testCases) {
      const id = uuid();
      try {
        await db.execute(
          `INSERT INTO test_cases (id, title, description, preconditions, priority, automation_status, project_id, status, created_by, jira_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, tc.title, (tc.gherkin_text || '').slice(0, 3000), tc.preconditions || '', tc.priority || 'medium', 'not_automated', projectId, 'draft', createdBy, jiraKey]
        );
        caseIds.push(id);
        for (const step of (tc.steps || [])) {
          await db.execute(
            'INSERT INTO test_steps (id, test_case_id, step_order, action, expected_result) VALUES (?, ?, ?, ?, ?)',
            [uuid(), id, step.order, (step.action || '').slice(0, 500), (step.expected_result || '').slice(0, 500)]
          );
        }
      } catch (e) {
        console.error('[JIRA] Erro ao salvar caso:', e.message);
      }
    }

    await db.execute(
      `INSERT INTO jira_links (id, jira_key, jira_summary, project_id, squad_id, gherkin_generated, created_at)
       VALUES (?, ?, ?, ?, ?, 1, NOW())
       ON DUPLICATE KEY UPDATE jira_summary=VALUES(jira_summary), gherkin_generated=1, squad_id=VALUES(squad_id)`,
      [uuid(), jiraKey, summary || jiraKey, projectId, squadId || null]
    );

    res.json({ ok: true, count: caseIds.length, caseIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { handleWebhook, saveCases, syncExecutionToJira, syncCycleToJira, generateGherkinManual, listLinks };
// Adicionar antes do module.exports no jiraController.js:

// ── Salvar casos gerados manualmente ─────────────────────────
// router.post('/jira/save-cases', auth, saveCases) — adicionar no routes/index.js
