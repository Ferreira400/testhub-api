/**
 * Script para testar com API v2 (melhor compatibilidade)
 * Execute com: node test-jira-v2.js
 */

require('dotenv').config();
const axios = require('axios');

const JIRA_URL = process.env.JIRA_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_API_TOKEN;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY || 'TH';

const jira = axios.create({
  baseURL: `${JIRA_URL}/rest/api/2`,
  auth: { username: JIRA_EMAIL, password: JIRA_TOKEN },
});

async function testAccessV2() {
  try {
    console.log('🔍 Testando acesso ao Jira (API v2)...\n');
    
    // 1. Último issue do projeto
    console.log(`1️⃣ Buscando última issue do projeto ${PROJECT_KEY}...`);
    const { data: search } = await jira.get('/search', {
      params: {
        jql: `project = ${PROJECT_KEY} ORDER BY created DESC`,
        maxResults: 1,
        fields: ['key', 'summary', 'status', 'created']
      }
    });
    
    if (search.issues.length === 0) {
      console.log(`   ❌ Nenhuma issue encontrada`);
      return;
    }
    
    const issue = search.issues[0];
    console.log(`   ✅ Issue: ${issue.key} - ${issue.fields.summary}`);
    
    // 2. Tenta ler a issue
    console.log(`\n2️⃣ Testando GET /issue/${issue.key}...`);
    try {
      const { data: issueData } = await jira.get(`/issue/${issue.key}`);
      console.log(`   ✅ Conseguiu ler`);
      console.log(`      Status: ${issueData.fields.status.name}`);
      console.log(`      Criado: ${issueData.fields.created}`);
      console.log(`      Assignee: ${issueData.fields.assignee?.name || 'Não atribuído'}`);
    } catch (err) {
      console.log(`   ❌ Erro: ${err.response?.status}`);
      console.log(`      ${err.response?.data?.errorMessages?.[0]}`);
      return;
    }
    
    // 3. Tenta atualizar labels
    console.log(`\n3️⃣ Testando PUT (labels)...`);
    try {
      await jira.put(`/issue/${issue.key}`, {
        fields: {
          labels: ['webhook-test']
        }
      });
      console.log(`   ✅ Conseguiu atualizar labels`);
    } catch (err) {
      console.log(`   ❌ Erro: ${err.response?.status}`);
      console.log(`      ${JSON.stringify(err.response?.data?.errors, null, 2)}`);
    }
    
    // 4. Tenta comentário
    console.log(`\n4️⃣ Testando POST (comentário)...`);
    try {
      await jira.post(`/issue/${issue.key}/comment`, {
        body: 'Teste de comentário via API'
      });
      console.log(`   ✅ Conseguiu adicionar comentário`);
    } catch (err) {
      console.log(`   ❌ Erro: ${err.response?.status}`);
      console.log(`      ${err.response?.data?.errorMessages?.[0]}`);
    }
    
    // 5. Tenta campo customizado
    console.log(`\n5️⃣ Testando PUT (campo customizado 10107)...`);
    try {
      await jira.put(`/issue/${issue.key}`, {
        fields: {
          customfield_10107: [{ id: '10020' }]
        }
      });
      console.log(`   ✅ Conseguiu atualizar campo customizado`);
    } catch (err) {
      console.log(`   ❌ Erro: ${err.response?.status}`);
      const errors = err.response?.data?.errors || {};
      console.log(`      ${JSON.stringify(errors, null, 2)}`);
    }
    
    console.log('\n═══════════════════════════════════════════════════\n');
    
  } catch (err) {
    console.error('❌ Erro geral:', err.message);
    if (err.response?.data) {
      console.error(JSON.stringify(err.response.data, null, 2));
    }
  }
}

testAccessV2();
