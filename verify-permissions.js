/**
 * Script para diagnosticar permissões no Jira
 * Execute com: node verify-permissions.js
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
  headers: { 'Content-Type': 'application/json' },
});

async function diagnosePermissions() {
  try {
    console.log('🔍 Diagnosticando permissões no Jira...\n');
    
    // 1. Verificar usuário autenticado
    console.log('1️⃣ Verificando usuário autenticado...');
    const { data: userInfo } = await jira.get('/myself');
    console.log(`   ✅ Usuário: ${userInfo.displayName} (${userInfo.emailAddress})`);
    
    // 2. Verificar projeto
    console.log(`\n2️⃣ Verificando projeto ${PROJECT_KEY}...`);
    const { data: projectInfo } = await jira.get(`/project/${PROJECT_KEY}`);
    console.log(`   ✅ Projeto: ${projectInfo.name}`);
    
    // 3. Verificar permissões no projeto
    console.log(`\n3️⃣ Verificando permissões no projeto...`);
    const { data: permissions } = await jira.get(`/project/${PROJECT_KEY}/permission`);
    console.log(`   Permissões encontradas:`);
    Object.entries(permissions).forEach(([perm, allowed]) => {
      if (allowed) console.log(`     ✅ ${perm}`);
    });
    
    // 4. Tentar editar uma issue existente (última story criada)
    console.log(`\n4️⃣ Testando permissão de edição em issue do projeto...`);
    const { data: issues } = await jira.get(`/search?jql=project=${PROJECT_KEY} ORDER BY created DESC&maxResults=1`);
    
    if (issues.issues.length > 0) {
      const testIssue = issues.issues[0];
      console.log(`   Testando com issue: ${testIssue.key}`);
      
      try {
        // Tenta fazer GET na issue
        const { data: issueData } = await jira.get(`/issue/${testIssue.key}`);
        console.log(`   ✅ GET /issue/${testIssue.key}: OK`);
        
        // Tenta fazer PUT (sem mudar nada)
        await jira.put(`/issue/${testIssue.key}`, {
          fields: {
            labels: issueData.fields.labels || []
          }
        });
        console.log(`   ✅ PUT /issue/${testIssue.key}: OK (pode editar)`);
        
      } catch (err) {
        console.log(`   ❌ Erro ao editar: ${err.response?.status}`);
        console.log(`   ${err.response?.data?.errorMessages?.[0] || err.message}`);
      }
    }
    
    // 5. Verificar se consegue criar issue
    console.log(`\n5️⃣ Verificando permissão de criação...`);
    const { data: createMeta } = await jira.get(`/issue/createmeta?projectKeys=${PROJECT_KEY}`);
    if (createMeta.projects.length > 0) {
      console.log(`   ✅ Pode criar issues no projeto`);
    }
    
    console.log('\n═══════════════════════════════════════════════════');
    console.log('✨ DIAGNÓSTICO CONCLUÍDO\n');
    
  } catch (err) {
    console.error('❌ Erro no diagnóstico:', err.response?.data || err.message);
  }
}

diagnosePermissions();
