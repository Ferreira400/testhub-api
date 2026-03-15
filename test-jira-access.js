/**
 * Script simplificado para testar acesso e permissões no Jira Cloud
 * Execute com: node test-jira-access.js
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
});

async function testAccess() {
  try {
    console.log('🔍 Testando acesso ao Jira...\n');
    
    // 1. Usuário
    console.log('1️⃣ Usuário autenticado:');
    const { data: user } = await jira.get('/myself');
    console.log(`   ✅ ${user.displayName} (${user.emailAddress})`);
    
    // 2. Projeto
    console.log(`\n2️⃣ Projeto ${PROJECT_KEY}:`);
    const { data: project } = await jira.get(`/project/${PROJECT_KEY}`);
    console.log(`   ✅ ${project.name}`);
    
    // 3. Última issue criada
    console.log(`\n3️⃣ Buscando últimas issues...`);
    const { data: search } = await jira.post('/search/jql', {
      jql: `project = ${PROJECT_KEY} ORDER BY created DESC`,
      maxResults: 1
    });
    
    if (search.issues.length > 0) {
      const issue = search.issues[0];
      console.log(`   ✅ Última issue: ${issue.key}`);
      
      // 4. Tenta ler a issue
      console.log(`\n4️⃣ Testando GET /issue/${issue.key}...`);
      const { data: issueData } = await jira.get(`/issue/${issue.key}`);
      console.log(`   ✅ Conseguiu ler a issue`);
      console.log(`      Status: ${issueData.fields.status.name}`);
      console.log(`      Criado em: ${issueData.fields.created}`);
      
      // 5. Tenta atualizar um campo simples (labels)
      console.log(`\n5️⃣ Testando PUT (atualizar labels)...`);
      try {
        await jira.put(`/issue/${issue.key}`, {
          fields: {
            labels: ['test-webhook']
          }
        });
        console.log(`   ✅ Conseguiu atualizar a issue (labels)`);
      } catch (err) {
        console.log(`   ❌ Erro ao atualizar: ${err.response?.status}`);
        console.log(`      ${err.response?.data?.errorMessages?.[0] || err.message}`);
      }
      
      // 6. Tenta atualizar campo customizado
      console.log(`\n6️⃣ Testando PUT (campo customizado 10107)...`);
      try {
        await jira.put(`/issue/${issue.key}`, {
          fields: {
            customfield_10107: [{ id: '10020' }]
          }
        });
        console.log(`   ✅ Conseguiu atualizar campo customizado`);
      } catch (err) {
        console.log(`   ❌ Erro: ${err.response?.status}`);
        console.log(`      ${JSON.stringify(err.response?.data, null, 2)}`);
      }
      
      // 7. Tenta adicionar comentário
      console.log(`\n7️⃣ Testando POST (adicionar comentário)...`);
      try {
        await jira.post(`/issue/${issue.key}/comment`, {
          body: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Teste de comentário' }] }]
          }
        });
        console.log(`   ✅ Conseguiu adicionar comentário`);
      } catch (err) {
        console.log(`   ❌ Erro: ${err.response?.status}`);
        console.log(`      ${err.response?.data?.errorMessages?.[0] || err.message}`);
      }
      
    } else {
      console.log(`   ❌ Nenhuma issue encontrada no projeto ${PROJECT_KEY}`);
    }
    
    console.log('\n═══════════════════════════════════════════════════\n');
    
  } catch (err) {
    console.error('❌ Erro:', err.message);
    if (err.response?.data) {
      console.error(JSON.stringify(err.response.data, null, 2));
    }
  }
}

testAccess();
