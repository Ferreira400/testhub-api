/**
 * src/controllers/jiraController.js
 * 
 * Recebe webhooks do Jira e orquestra geração de Gherkin + notificações
 */

const db                  = require('../config/db');
const jiraService         = require('../services/jiraService');
const gherkinService      = require('../services/gherkinService');
const notificationService = require('../services/notificationService');
const { v4: uuid }        = require('uuid');

// ── Webhook principal ─────────────────────────────────────────

async function handleWebhook(req, res) {
  // Responde imediatamente para o Jira não dar timeout
  res.status(200).json({ received: true });

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
      await handleStoryUpdated({ key, summary, description, issue });
    }

    if (webhookEvent === 'jira:issue_deleted') {
      await handleStoryDeleted(key);
    }
  } catch (err) {
    console.error(`[JIRA WEBHOOK] Erro processando ${JSON.stringify(key)}:`, err.message);
    // Mostra mais detalhes (axios / request errors) para facilitar diagnóstico
    if (err.response) {
      console.error('[JIRA WEBHOOK] response:', {
        status: err.response.status,
        data: err.response.data
      });
    }
    console.error(err.stack || err);
  }
}

async function getDefaultCreatedBy() {
  // Webhook actions run without an authenticated user, but the test_cases.created_by
  // foreign key requires a valid users.id. Use the first available user as fallback.
  const [users] = await db.execute('SELECT id FROM users LIMIT 1');
  if (users.length) return users[0].id;

  throw new Error('Nenhum usuário cadastrado. Crie um usuário antes de processar webhooks do Jira.');
}

// ── Story criada → gera Gherkin + casos de teste ──────────────

async function handleStoryCreated({ key, summary, description, acceptance }) {
  console.log(`[JIRA] Story criada: ${key} — ${summary}`);

  // Busca projeto e squad padrão (ou por label do Jira)
  const [projects] = await db.execute('SELECT id FROM projects LIMIT 1');
  const [squads]   = await db.execute('SELECT id, name FROM squads LIMIT 1');
  if (!projects.length) return;

  const projectId = projects[0].id;
  const squadId   = squads[0]?.id;
  const squadName = squads[0]?.name;

  // Gera Gherkin com IA
  console.log(`[JIRA] Gerando Gherkin para ${key}...`);
  const gherkinJson = await gherkinService.generateGherkin({ summary, description, acceptanceCriteria: acceptance });
  const testCases   = gherkinService.gherkinToTestCases({ gherkinJson, projectId, squadId, jiraKey: key });

  // Salva casos de teste no banco
  const caseIds = [];
  const createdBy = await getDefaultCreatedBy();
  for (const tc of testCases) {
    const id = uuid();
    await db.execute(
      `INSERT INTO test_cases (
         id, title, description, preconditions, priority, automation_status, project_id, status, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        tc.title,
        `${tc.description}\n\n${tc.gherkin_text}`,
        tc.preconditions,
        tc.priority,
        'not_automated',   // valor válido do ENUM
        projectId,
        'draft',           // valor válido do ENUM
        createdBy
      ]
    );




    // Salva steps
    for (const step of tc.steps) {
      await db.execute(
        'INSERT INTO test_steps (id, test_case_id, step_order, action, expected_result) VALUES (?, ?, ?, ?, ?)',
        [uuid(), id, step.order, step.action, step.expected_result]
      );
    }

    caseIds.push(id);
  }

  // Salva vinculação Jira → TestHub
  await db.execute(
    `INSERT INTO jira_links (id, jira_key, jira_summary, project_id, squad_id, gherkin_generated, created_at)
     VALUES (?, ?, ?, ?, ?, 1, NOW())
     ON DUPLICATE KEY UPDATE jira_summary=VALUES(jira_summary), gherkin_generated=1`,
    [uuid(), key, summary, projectId, squadId]
  );

  // Atualiza Jira com IDs dos casos
  await jiraService.setTestHubFields(key, { gherkinGenerated: true });
  await jiraService.addComment(key,
    `✅ TestHub gerou ${testCases.length} cenários de teste automaticamente.\n` +
    `Ver em: ${process.env.FRONTEND_URL}/test-cases?jira=${key}`
  );

  // Notifica Teams + Email
  const emails = await getSquadEmails(squadId);
  await notificationService.notifyNewStory({ jiraKey: key, summary, scenariosCount: testCases.length, testCaseIds: caseIds, squadName });
  if (emails.length) {
    await notificationService.emailNewStory({ to: emails, jiraKey: key, summary, scenariosCount: testCases.length });
  }

  console.log(`[JIRA] ${key}: ${testCases.length} casos criados com sucesso`);
}

// ── Story atualizada → notifica QA ───────────────────────────

async function handleStoryUpdated({ key, summary, issue }) {
  const [links] = await db.execute('SELECT * FROM jira_links WHERE jira_key = ?', [key]);
  if (!links.length) return;

  const link = links[0];
  await db.execute('UPDATE jira_links SET jira_summary = ?, updated_at = NOW() WHERE jira_key = ?', [summary, key]);
  console.log(`[JIRA] Story atualizada: ${key}`);
}

// ── Story deletada → depreca casos ───────────────────────────

async function handleStoryDeleted(key) {
  await db.execute(
    `UPDATE test_cases SET status = 'deprecated' 
     WHERE description LIKE ? AND status = 'active'`,
    [`%${key}%`]
  );
  await db.execute('UPDATE jira_links SET deleted_at = NOW() WHERE jira_key = ?', [key]);
  console.log(`[JIRA] Story deletada: ${key} — casos deprecados`);
}

// ── Sincronizar resultado de execução → Jira ──────────────────

async function syncExecutionToJira(req, res) {
  const { executionId } = req.params;
  try {
    const [execs] = await db.execute(
      `SELECT e.*, tc.title as case_title, tc.description as case_desc
       FROM test_executions e
       JOIN test_cases tc ON e.test_case_id = tc.id
       WHERE e.id = ?`,
      [executionId]
    );
    if (!execs.length) return res.status(404).json({ error: 'Execução não encontrada' });

    const exec = execs[0];
    const jiraKey = extractJiraKey(exec.case_desc);
    if (!jiraKey) return res.status(400).json({ error: 'Caso não vinculado ao Jira' });

    if (exec.status === 'failed') {
      const [squads] = await db.execute('SELECT name FROM squads WHERE id = ?', [exec.squad_id]);
      const bug = await jiraService.createBugFromExecution({
        storyKey:    jiraKey,
        testCaseName: exec.case_title,
        executionId,
        error:       exec.comments,
        assignee:    exec.executed_by,
      });

      await notificationService.notifyBugCreated({
        jiraKey,
        bugKey:       bug.key,
        testCaseName: exec.case_title,
        executionId,
        squadName:    squads[0]?.name,
      });

      return res.json({ ok: true, bug: bug.key });
    }

    await jiraService.addComment(jiraKey, `✅ Caso "${exec.case_title}" passou no TestHub.`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Sincronizar ciclo completo → Jira ─────────────────────────

async function syncCycleToJira(req, res) {
  const { cycleId } = req.params;
  try {
    const [cycles] = await db.execute('SELECT * FROM test_cycles WHERE id = ?', [cycleId]);
    if (!cycles.length) return res.status(404).json({ error: 'Ciclo não encontrado' });

    const [stats] = await db.execute(
      `SELECT status, COUNT(*) as total FROM test_executions WHERE cycle_id = ? GROUP BY status`,
      [cycleId]
    );

    const passed = Number(stats.find(s => s.status === 'passed')?.total || 0);
    const failed = Number(stats.find(s => s.status === 'failed')?.total || 0);
    const total  = stats.reduce((s, x) => s + Number(x.total), 0);

    // Busca jira_key pelo projeto do ciclo
    const [links] = await db.execute(
      'SELECT jira_key FROM jira_links WHERE project_id = ? ORDER BY created_at DESC LIMIT 1',
      [cycles[0].project_id]
    );
    if (!links.length) return res.status(400).json({ error: 'Projeto não vinculado ao Jira' });

    const [squads] = await db.execute('SELECT name FROM squads WHERE id = ?', [cycles[0].squad_id]);

    await jiraService.syncCycleResult({
      storyKey: links[0].jira_key,
      cycleId,
      passed, failed, total,
    });

    await notificationService.notifyCycleResult({
      jiraKey:   links[0].jira_key,
      summary:   cycles[0].name,
      passed, failed, total, cycleId,
      squadName: squads[0]?.name,
    });

    res.json({ ok: true, passed, failed, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Gerar Gherkin manualmente (botão no frontend) ─────────────

async function generateGherkinManual(req, res) {
  const { jiraKey } = req.params;
  try {
    const issue = await jiraService.getIssue(jiraKey);
    const summary     = issue.fields.summary;
    const description = extractDescription(issue.fields.description);

    const gherkinJson = await gherkinService.generateGherkin({ summary, description });
    const gherkinText = gherkinService.toGherkinText(gherkinJson);

    res.json({ jiraKey, summary, gherkinJson, gherkinText, scenarios: gherkinJson.scenarios.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Listar vínculos Jira ──────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────

function extractDescription(descField) {
  if (!descField) return '';
  if (typeof descField === 'string') return descField;
  // Jira Atlassian Document Format
  try {
    return descField.content
      ?.flatMap(b => b.content || [])
      ?.filter(n => n.type === 'text')
      ?.map(n => n.text)
      ?.join(' ') || '';
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
    `SELECT u.email FROM users u
     JOIN squad_members sm ON u.id = sm.user_id
     WHERE sm.squad_id = ?`,
    [squadId]
  );
  return rows.map(r => r.email);
}

module.exports = {
  handleWebhook,
  syncExecutionToJira,
  syncCycleToJira,
  generateGherkinManual,
  listLinks,
};
