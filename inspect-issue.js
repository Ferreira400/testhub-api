/**
 * Script para inspecionar uma issue existente e seus campos
 * Execute com: node inspect-issue.js TH-9
 */

require('dotenv').config();
const axios = require('axios');

const JIRA_URL = process.env.JIRA_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_API_TOKEN;

const jira = axios.create({
  baseURL: `${JIRA_URL}/rest/api/3`,
  auth: { username: JIRA_EMAIL, password: JIRA_TOKEN },
  headers: { 'Content-Type': 'application/json' },
});

async function inspectIssue() {
  const issueKey = process.argv[2] || 'TH-9';
  
  try {
    console.log(`🔍 Inspecionando issue ${issueKey}...\n`);
    
    const { data } = await jira.get(`/issue/${issueKey}`);
    
    console.log('📋 Campos customizados encontrados:');
    console.log('═'.repeat(60));
    
    const customFields = Object.entries(data.fields).filter(([k]) => k.startsWith('customfield_'));
    
    customFields.forEach(([fieldId, value]) => {
      console.log(`\n${fieldId}:`);
      console.log(`  Valor: ${JSON.stringify(value)}`);
      console.log(`  Tipo: ${typeof value}`);
    });
    
  } catch (err) {
    console.error('❌ Erro:', err.response?.data || err.message);
  }
}

inspectIssue();
