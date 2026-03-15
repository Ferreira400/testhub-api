/**
 * Script para descobrir os IDs reais dos campos customizados no Jira
 * Execute com: node discover-fields.js
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

async function discoverFields() {
  try {
    console.log('🔍 Buscando campos da instância Jira...\n');
    
    const { data } = await jira.get('/field');
    
    // Filtrar apenas campos customizados
    const customFields = data.filter(field => field.custom === true);
    
    // Buscar os campos específicos que procuramos
    const fieldMap = {};
    
    customFields.forEach(field => {
      console.log(`📋 ${field.id} - ${field.name}`);
      
      if (field.name.toLowerCase().includes('gherkin') || field.name.toLowerCase().includes('teste automático')) {
        fieldMap.CUSTOMFIELD_GHERKIN_GENERATED = field.id;
        console.log(`   ✅ GHERKIN: ${field.id}`);
      }
      
      if (field.name.toLowerCase().includes('testhub case') || field.name.toLowerCase().includes('id do caso')) {
        fieldMap.CUSTOMFIELD_TESTHUB_CASE_ID = field.id;
        console.log(`   ✅ TESTHUB_CASE_ID: ${field.id}`);
      }
      
      if (field.name.toLowerCase().includes('testhub status') || field.name.toLowerCase().includes('status da última')) {
        fieldMap.CUSTOMFIELD_TESTHUB_STATUS = field.id;
        console.log(`   ✅ TESTHUB_STATUS: ${field.id}`);
      }
    });
    
    console.log('\n═══════════════════════════════════════════────────────');
    console.log('📝 ADICIONE ESTAS LINHAS NO SEU .env:\n');
    console.log(`JIRA_CUSTOMFIELD_GHERKIN_GENERATED=${fieldMap.CUSTOMFIELD_GHERKIN_GENERATED || 'NÃO_ENCONTRADO'}`);
    console.log(`JIRA_CUSTOMFIELD_TESTHUB_CASE_ID=${fieldMap.CUSTOMFIELD_TESTHUB_CASE_ID || 'NÃO_ENCONTRADO'}`);
    console.log(`JIRA_CUSTOMFIELD_TESTHUB_STATUS=${fieldMap.CUSTOMFIELD_TESTHUB_STATUS || 'NÃO_ENCONTRADO'}`);
    console.log('═══════════════════════════════════════════────────────\n');
    
  } catch (err) {
    console.error('❌ Erro ao buscar campos:', err.response?.data || err.message);
  }
}

discoverFields();
