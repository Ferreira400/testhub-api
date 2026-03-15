/**
 * Script corrigido com API v3
 * Execute com: node test-jira-final.js
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

async function testAccess() {
  try {
    console.log('🔍 Testando acesso ao Jira (API v3)...\n');
    
    // 1. Buscando última issue
    console.log(`1️⃣ Buscando última issue do projeto ${PROJECT_KEY}...`);
    const { data: search } = await jira.post('/search/jql', {
      jql: `project = ${PROJECT_KEY} ORDER BY created DESC`,
      maxResults: 1
    });
    
    if (search.issues.length === 0) {
      console.log(`   ❌ Nenhuma issue encontrada`);
      return;
    }
    
    const issueKey = search.issues[0].key;
    console.log(`   ✅ Issue encontrada: ${issueKey}`);
    
    // 2. GET issue
    console.log(`\n2️⃣ GET /issue/${issueKey}...`);
    try {
      const { data: issue } = await jira.get(`/issue/${issueKey}`);
      console.log(`   ✅ Conseguiu ler`);
      console.log(`      Summary: ${issue.fields.summary}`);
      console.log(`      Status: ${issue.fields.status.name}`);
    } catch (err) {
      console.log(`   ❌ Erro ${err.response?.status}: ${err.response?.data?.errorMessages?.[0]}`);
      return;
    }
    
    // 3. PUT labels (teste simples)
    console.log(`\n3️⃣ PUT /issue/${issueKey} (labels)...`);
    try {
      await jira.put(`/issue/${issueKey}`, {
        fields: { labels: ['test'] }
      });
      console.log(`   ✅ Conseguiu editar (labels)`);
    } catch (err) {
      console.log(`   ❌ Erro ${err.response?.status}`);
      if (err.response?.data?.errors) {
        console.log(`      Detalhes: ${JSON.stringify(err.response.data.errors)}`);
      }
    }
    
    // 4. PUT campo customizado
    console.log(`\n4️⃣ PUT /issue/${issueKey} (customfield_10107)...`);
    try {
      await jira.put(`/issue/${issueKey}`, {
        fields: { customfield_10107: [{ id: '10020' }] }
      });
      console.log(`   ✅ Conseguiu atualizar campo (10107)`);
    } catch (err) {
      console.log(`   ❌ Erro ${err.response?.status}`);
      if (err.response?.data?.errorMessages) {
        console.log(`      ${err.response.data.errorMessages[0]}`);
      }
      if (err.response?.data?.errors) {
        console.log(`      Detalhes:`, err.response.data.errors);
      }
    }
    
    // 5. POST comentário
    console.log(`\n5️⃣ POST /issue/${issueKey}/comment...`);
    try {
      await jira.post(`/issue/${issueKey}/comment`, {
        body: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Teste' }] }]
        }
      });
      console.log(`   ✅ Conseguiu adicionar comentário`);
    } catch (err) {
      console.log(`   ❌ Erro ${err.response?.status}`);
      console.log(`      ${err.response?.data?.errorMessages?.[0]}`);
    }
    
    console.log('\n═══════════════════════════════════════════════════\n');
    
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

testAccess();
