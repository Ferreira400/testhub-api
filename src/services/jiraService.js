/**
 * src/services/jiraService.js
 * Servico de integracao com Jira Cloud API v3
 */

const axios = require('axios');

const JIRA_URL    = process.env.JIRA_URL;
const JIRA_EMAIL  = process.env.JIRA_EMAIL;
const JIRA_TOKEN  = process.env.JIRA_API_TOKEN;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || 'TH';

const jira = axios.create({
  baseURL: `${JIRA_URL}/rest/api/3`,
  auth:    { username: JIRA_EMAIL, password: JIRA_TOKEN },
  headers: { 'Content-Type': 'application/json' },
});

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
        type: 'doc', version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
      },
      ...(parentKey ? { parent: { key: parentKey } } : {}),
    },
  };
  const { data } = await jira.post('/issue', body);
  return data;
}

async function addComment(issueKey, text) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await jira.post(`/issue/${issueKey}/comment`, {
        body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
      });
      return;
    } catch (err) {
      if (err?.response?.status === 404 && attempt < 3) {
        await new Promise(r => setTimeout(r, 5000));
      } else {
        console.warn(`[JIRA] Comentario em ${issueKey} falhou:`, err.response?.data?.errorMessages?.[0] || err.message);
        return;
      }
    }
  }
}

async function transitionIssue(issueKey, statusName) {
  try {
    const { data } = await jira.get(`/issue/${issueKey}/transitions`);
    const transition = data.transitions.find(t => t.name.toLowerCase().includes(statusName.toLowerCase()));
    if (!transition) return;
    await jira.post(`/issue/${issueKey}/transitions`, { transition: { id: transition.id } });
  } catch (err) {
    console.warn(`[JIRA] Transicao de ${issueKey} falhou:`, err.message);
  }
}

// Campos customizados desabilitados - configurar via JIRA_CUSTOMFIELD_* no .env quando necessario
async function setTestHubFields(issueKey, fields = {}) {
  console.log(`[JIRA] setTestHubFields ignorado para ${issueKey} — configure campos customizados no .env`);
}

async function searchIssues(jql, fields = ['summary', 'status', 'assignee', 'description']) {
  const { data } = await jira.post('/search/jql', { jql, fields, maxResults: 100 });
  return data.issues;
}

async function getStoriesInSprint() {
  return searchIssues(`project = ${PROJECT_KEY} AND issuetype = Story AND sprint in openSprints()`);
}

async function createBugFromExecution({ storyKey, testCaseName, executionId, error }) {
  const bug = await createIssue({
    summary:     `[AUTO] Falha em: ${testCaseName}`,
    description: `Execucao ID: ${executionId}\n\nErro:\n${error || 'Ver TestHub para detalhes'}\n\nGerado pelo TestHub.`,
    issueType:   'Bug',
    parentKey:   storyKey,
    labels:      ['testhub-auto', 'qa-failure'],
  });
  await addComment(storyKey, `Falha detectada no TestHub\nCaso: ${testCaseName}\nBug: ${bug.key}`);
  return bug;
}

async function syncCycleResult({ storyKey, cycleId, passed, failed, total }) {
  const passRate = total ? Math.round(passed / total * 100) : 0;
  const emoji    = passRate === 100 ? 'PASSOU' : passRate >= 70 ? 'PARCIAL' : 'FALHOU';
  await addComment(storyKey,
    `${emoji} - Ciclo TestHub concluido\nPassou: ${passed}/${total} (${passRate}%)\nFalhou: ${failed}`
  );
  if (passRate === 100) await transitionIssue(storyKey, 'Done');
  else await transitionIssue(storyKey, 'In QA');
}

module.exports = {
  getIssue, updateIssue, createIssue, addComment, transitionIssue,
  setTestHubFields, searchIssues, getStoriesInSprint,
  createBugFromExecution, syncCycleResult,
};
