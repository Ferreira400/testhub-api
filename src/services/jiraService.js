/**
 * src/services/jiraService.js
 * 
 * Serviço de integração com Jira Cloud API v3
 * npm install axios
 */

const axios = require('axios');

const JIRA_URL     = process.env.JIRA_URL;
const JIRA_EMAIL   = process.env.JIRA_EMAIL;
const JIRA_TOKEN   = process.env.JIRA_API_TOKEN;
const PROJECT_KEY  = process.env.JIRA_PROJECT_KEY || 'TH';

// Permite configurar IDs de campo custom via env vars (pode variar por instância Jira)
const CUSTOMFIELD_GHERKIN_GENERATED = process.env.JIRA_CUSTOMFIELD_GHERKIN_GENERATED || 'customfield_gherkin_generated';
const CUSTOMFIELD_TESTHUB_CASE_ID   = process.env.JIRA_CUSTOMFIELD_TESTHUB_CASE_ID   || 'customfield_testhub_case_id';
const CUSTOMFIELD_TESTHUB_STATUS    = process.env.JIRA_CUSTOMFIELD_TESTHUB_STATUS    || 'customfield_testhub_status';

const jira = axios.create({
  baseURL: `${JIRA_URL}/rest/api/3`,
  auth: { username: JIRA_EMAIL, password: JIRA_TOKEN },
  headers: { 'Content-Type': 'application/json' },
});

// ── Issues ────────────────────────────────────────────────────

async function getIssue(issueKey) {
  const { data } = await jira.get(`/issue/${issueKey}`);
  return data;
}

async function updateIssue(issueKey, fields) {
  await jira.put(`/issue/${issueKey}`, { fields });
}

async function createIssue({ summary, description, issueType = 'Bug', parentKey, labels = [] }) {
  const body = {
    fields: {
      project:   { key: PROJECT_KEY },
      summary,
      issuetype: { name: issueType },
      labels,
      description: {
        type:    'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
      },
      ...(parentKey ? { parent: { key: parentKey } } : {}),
    },
  };
  const { data } = await jira.post('/issue', body);
  return data;
}

async function addComment(issueKey, text) {
  await jira.post(`/issue/${issueKey}/comment`, {
    body: {
      type:    'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
  });
}

async function transitionIssue(issueKey, statusName) {
  // Busca transições disponíveis
  const { data } = await jira.get(`/issue/${issueKey}/transitions`);
  const transition = data.transitions.find(
    t => t.name.toLowerCase().includes(statusName.toLowerCase())
  );
  if (!transition) return;
  await jira.post(`/issue/${issueKey}/transitions`, {
    transition: { id: transition.id },
  });
}

// ── Campos customizados TestHub ───────────────────────────────

async function setTestHubFields(issueKey, { caseId, status, gherkinGenerated }) {
  // Os IDs dos campos custom variam por instância Jira
  // Busque com: GET /rest/api/3/field
  const fields = {};
  if (caseId          !== undefined) fields[CUSTOMFIELD_TESTHUB_CASE_ID]    = String(caseId);
  if (status          !== undefined) fields[CUSTOMFIELD_TESTHUB_STATUS]      = status;
  if (gherkinGenerated !== undefined) fields[CUSTOMFIELD_GHERKIN_GENERATED] = gherkinGenerated;

  if (!Object.keys(fields).length) return;

  try {
    await updateIssue(issueKey, fields);
  } catch (err) {
    // Alguns campos custom podem não estar disponíveis no projeto / tela.
    // Nesse caso, apenas logamos e seguimos em frente (não queremos interromper o webhook inteiro).
    const errKey = err?.response?.data?.errors ? Object.keys(err.response.data.errors)[0] : null;
    if (err?.response?.status === 400 && errKey) {
      console.warn('[JIRA] Não foi possível setar campo customizado:', errKey, err.response.data.errors[errKey]);
      return;
    }
    throw err;
  }
}

// ── Busca issues ──────────────────────────────────────────────

async function searchIssues(jql, fields = ['summary', 'status', 'assignee', 'description']) {
  // Jira Cloud migrated search endpoint to /rest/api/3/search/jql (410 if not used).
  const { data } = await jira.post('/search/jql', {
    jql,
    fields,
    maxResults: 100,
  });
  return data.issues;
}

async function getStoriesInSprint() {
  return searchIssues(
    `project = ${PROJECT_KEY} AND issuetype = Story AND sprint in openSprints()`,
    ['summary', 'description', 'status', 'assignee', 'customfield_testhub_case_id']
  );
}

// ── Bug automático ao falhar execução ─────────────────────────

async function createBugFromExecution({ storyKey, testCaseName, executionId, error, assignee }) {
  const bug = await createIssue({
    summary:     `[AUTO] Falha em: ${testCaseName}`,
    description: `Execução ID: ${executionId}\n\nErro encontrado:\n${error || 'Ver TestHub para detalhes'}\n\nGerado automaticamente pelo TestHub.`,
    issueType:   'Bug',
    parentKey:   storyKey,
    labels:      ['testhub-auto', 'qa-failure'],
  });

  await addComment(storyKey,
    `🔴 Falha detectada no TestHub\nCaso: ${testCaseName}\nBug criado: ${bug.key}\nVer execução: ${process.env.FRONTEND_URL}/executions/${executionId}`
  );

  return bug;
}

// ── Sincronizar resultado de ciclo ────────────────────────────

async function syncCycleResult({ storyKey, cycleId, passed, failed, total }) {
  const passRate = total ? Math.round(passed / total * 100) : 0;
  const emoji    = passRate === 100 ? '✅' : passRate >= 70 ? '⚠️' : '🔴';

  await addComment(storyKey,
    `${emoji} Ciclo de testes concluído no TestHub\n` +
    `Passou: ${passed}/${total} (${passRate}%)\n` +
    `Falhou: ${failed}\n` +
    `Ver relatório: ${process.env.FRONTEND_URL}/reports?cycle=${cycleId}`
  );

  await setTestHubFields(storyKey, { status: passRate === 100 ? 'passed' : 'failed' });

  if (passRate === 100) {
    await transitionIssue(storyKey, 'Done');
  } else {
    await transitionIssue(storyKey, 'In QA');
  }
}

module.exports = {
  getIssue,
  updateIssue,
  createIssue,
  addComment,
  transitionIssue,
  setTestHubFields,
  searchIssues,
  getStoriesInSprint,
  createBugFromExecution,
  syncCycleResult,
};
