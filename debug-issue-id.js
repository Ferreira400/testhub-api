/**
 * Test - usar o ID para pegar a chave
 */

require('dotenv').config();
const axios = require('axios');

const JIRA_URL = process.env.JIRA_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_API_TOKEN;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || 'TH';

const jira = axios.create({
  baseURL: `${JIRA_URL}/rest/api/3`,
  auth: { username: JIRA_EMAIL, password: JIRA_TOKEN },
  headers: { 'Content-Type': 'application/json' }
});

(async () => {
  try {
    console.log('🔍 Testando com IDs da busca:\n');
    
    const { data: search } = await jira.post('/search/jql', {
      jql: `project = ${PROJECT_KEY} ORDER BY created DESC`,
      maxResults: 1
    });
    
    if (search.issues.length === 0) {
      console.log('❌ Nenhuma issue encontrada');
      return;
    }
    
    const issueId = search.issues[0].id;
    console.log(`ID retornado: ${issueId}`);
    
   console.log(`\nTentando GET /issue/${issueId}...`);
    try {
      const { data: issue } = await jira.get(`/issue/${issueId}`);
      console.log(`✅ Conseguiu!`);
      console.log(`   Key: ${issue.key}`);
      console.log(`   Summary: ${issue.fields.summary}`);
      console.log(`   Status: ${issue.fields.status.name}`);
    } catch (err) {
      console.log(`❌ Erro ${err.response?.status}`);
      console.log(`   ${err.response?.data?.errorMessages?.[0]}`);
    }
    
  } catch (err) {
    console.error('Erro:', err.response?.data || err.message);
  }
})();
