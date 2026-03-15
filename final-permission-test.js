/**
 * Final test - verificar permissões com issue real
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
    console.log('🔍 Testando permissões com issue real:\n');
    
    // Pega última issue
    const { data: search } = await jira.post('/search/jql', {
      jql: `project = ${PROJECT_KEY} ORDER BY created DESC`,
      maxResults: 1
    });
    
    const issueId = search.issues[0].id;
    const { data: issue } = await jira.get(`/issue/${issueId}`);
    const issueKey = issue.key;
    
    console.log(`✅ Issue: ${issueKey}`);
    
    // 1. Tenta editar labels
    console.log(`\n1️⃣ PUT ${issueKey} (labels)...`);
    try {
      await jira.put(`/issue/${issueId}`, {
        fields: { labels: ['permission-test'] }
      });
      console.log(`   ✅ Conseguiu editar labels`);
    } catch (err) {
      console.log(`   ❌ ${err.response?.status} - ${err.response?.data?.errorMessages?.[0]}`);
    }
    
    // 2. Tenta comentário
    console.log(`\n2️⃣ POST ${issueKey}/comment...`);
    try {
      await jira.post(`/issue/${issueId}/comment`, {
        body: {
          type: 'doc',
          version: 1,
          content: [{  type: 'paragraph', content: [{ type: 'text', text: 'Test comment' }] }]
        }
      });
      console.log(`   ✅ Conseguiu adicionar comentário`);
    } catch (err) {
      console.log(`   ❌ ${err.response?.status} - ${err.response?.data?.errorMessages?.[0]}`);
    }
    
    // 3. Tenta campo customizado 10107
    console.log(`\n3️⃣ PUT ${issueKey} (customfield_10107)...`);
    try {
      await jira.put(`/issue/${issueId}`, {
        fields: { customfield_10107: [{ id: '10020' }] }
      });
      console.log(`   ✅ Conseguiu editar campo 10107`);
    } catch (err) {
      console.log(`   ❌ ${err.response?.status}`);
      if (err.response?.data?.errors?.customfield_10107) {
        console.log(`      ${err.response.data.errors.customfield_10107}`);
      } else {
        console.log(`      ${JSON.stringify(err.response?.data?.errors || err.response?.data?.errorMessages)}`);
      }
    }
    
    console.log('\n═══════════════════════════════════════════════════\n');
    
  } catch (err) {
    console.error('Erro:', err.message);
  }
})();
