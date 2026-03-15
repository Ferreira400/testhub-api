/**
 * Script para descobrir o formato correto dos campos customizados via editmeta
 * Execute com: node check-editmeta.js TH-9
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

async function checkEditMeta() {
  const issueKey = process.argv[2] || 'TH-9';
  
  try {
    console.log(`🔍 Buscando editmeta para ${issueKey}...\n`);
    
    const { data } = await jira.get(`/issue/${issueKey}/editmeta`);
    
    console.log('📋 Campos editáveis:');
    console.log('═'.repeat(60));
    
    Object.entries(data.fields).forEach(([fieldId, fieldConfig]) => {
      if (fieldId.startsWith('customfield_10')) {
        console.log(`\n${fieldId}:`);
        console.log(JSON.stringify(fieldConfig, null, 2));
      }
    });
    
  } catch (err) {
    console.error('❌ Erro:', err.response?.data || err.message);
  }
}

checkEditMeta();
