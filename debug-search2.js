/**
 * Debug - testar com campos corretos
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
    console.log('🔍 Debug - Com expand:\n');
    
    const { data } = await jira.post('/search/jql', {
      jql: `project = ${PROJECT_KEY} ORDER BY created DESC`,
      maxResults: 1,
      expand: ['changelog'],
      fields: ['key', 'summary', 'status']
    });
    
    console.log('Result:');
    console.log(JSON.stringify(data.issues[0], null, 2));
    
    if (data.issues[0]) {
      console.log(`\n✅ Issue key: ${data.issues[0].key}`);
    }
    
  } catch (err) {
    console.error('Erro:', err.response?.data || err.message);
  }
})();
