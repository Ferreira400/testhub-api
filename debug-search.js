/**
 * Debug - imprimir resultado completo da busca
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
    console.log('🔍 Debug - Resultado completo da busca:\n');
    
    const { data } = await jira.post('/search/jql', {
      jql: `project = ${PROJECT_KEY} ORDER BY created DESC`,
      maxResults: 3
    });
    
    console.log('Total encontrado:', data.total);
    console.log('\nIssues:');
    console.log(JSON.stringify(data.issues.slice(0, 3), null, 2));
    
  } catch (err) {
    console.error('Erro:', err.response?.data || err.message);
  }
})();
