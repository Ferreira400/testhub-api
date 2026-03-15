/**
 * Script para descobrir o schema dos campos customizados
 * Execute com: node check-field-schema.js
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

async function checkFieldSchema() {
  try {
    console.log('🔍 Buscando schema de criação de issue para o projeto...\n');
    
    // Pega o schema de criação
    const { data } = await jira.get(`/issue/createmeta?projectKeys=${PROJECT_KEY}&expand=schema`);
    
    const project = data.projects[0];
    if (!project) {
      console.error('❌ Projeto não encontrado');
      return;
    }
    
    const issueTypes = project.issuetypes;
    
    issueTypes.forEach(issueType => {
      console.log(`\n📋 Tipo de Issue: ${issueType.name}`);
      console.log('═'.repeat(50));
      
      Object.entries(issueType.fields).forEach(([fieldId, field]) => {
        if (fieldId.includes('customfield_10107') || fieldId.includes('customfield_10105') || fieldId.includes('customfield_10106')) {
          console.log(`\n✨ ${fieldId} - ${field.name}`);
          console.log(`   Tipo: ${field.schema?.type}`);
          console.log(`   Requerido: ${field.required}`);
          
          if (field.allowedValues) {
            console.log(`   Valores permitidos:`);
            field.allowedValues.forEach(v => {
              console.log(`     - ${v.value} (${v.name})`);
            });
          }
          
          if (field.schema?.items) {
            console.log(`   Items type: ${field.schema.items}`);
          }
          
          console.log(`   Schema completo:`, JSON.stringify(field.schema, null, 2));
        }
      });
    });
    
  } catch (err) {
    console.error('❌ Erro:', err.response?.data || err.message);
  }
}

checkFieldSchema();
