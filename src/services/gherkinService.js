/**
 * src/services/gherkinService.js
 * Geração de cenários Gherkin com Groq API (gratuito, rápido)
 */

const https = require('https');

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL   = 'llama-3.1-8b-instant';

function callGroq(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model:       GROQ_MODEL,
      messages:    [{ role: 'user', content: prompt }],
      max_tokens:  4000,
      temperature: 0.3,
    });

    const req = https.request({
      hostname: 'api.groq.com',
      path:     '/openai/v1/chat/completions',
      method:   'POST',
      headers:  {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type':  'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
          const text = parsed.choices?.[0]?.message?.content;
          if (!text) return reject(new Error('Resposta vazia: ' + data));
          resolve(text);
        } catch (e) {
          reject(new Error('Parse error: ' + data.slice(0, 200)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function generateGherkin({ summary, description, acceptanceCriteria = '' }) {
  const prompt = `Você é um QA Engineer especialista em BDD e Gherkin.

Analise a história de usuário e gere cenários de teste em Gherkin (português brasileiro).

**História:** ${summary}
**Descrição:** ${description || 'Não informada'}
**Critérios de Aceite:** ${acceptanceCriteria || 'Não informados'}

Gere cenários cobrindo: happy path, erros e edge cases.

Responda APENAS com JSON válido, sem markdown, sem texto adicional:
{
  "feature": "nome da funcionalidade",
  "scenarios": [
    {
      "name": "nome do cenário",
      "type": "happy_path",
      "tags": ["@smoke"],
      "steps": [
        { "keyword": "Dado", "text": "que o usuário está na tela X" },
        { "keyword": "Quando", "text": "ele realiza ação Y" },
        { "keyword": "Então", "text": "o sistema deve Z" }
      ],
      "examples": null
    }
  ]
}`;

  const text  = await callGroq(prompt);
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try {
    return JSON.parse(clean);
  } catch {
    throw new Error('Formato inválido: ' + clean.slice(0, 200));
  }
}

function toGherkinText(gherkinJson) {
  const lines = [`Feature: ${gherkinJson.feature}`, ''];
  for (const s of gherkinJson.scenarios) {
    if (s.tags?.length) lines.push(`  ${s.tags.join(' ')}`);
    lines.push(`  ${s.examples ? 'Scenario Outline' : 'Scenario'}: ${s.name}`);
    for (const step of s.steps) lines.push(`    ${step.keyword} ${step.text}`);
    if (s.examples) {
      lines.push('', '    Examples:');
      lines.push(`      | ${s.examples.headers.join(' | ')} |`);
      for (const row of s.examples.rows) lines.push(`      | ${row.join(' | ')} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function gherkinToTestCases({ gherkinJson, projectId, squadId, jiraKey }) {
  return gherkinJson.scenarios.map(scenario => ({
    title:        scenario.name,
    description:  `Gerado automaticamente da Story Jira: ${jiraKey}`,
    preconditions: scenario.steps.filter(s => ['Dado','Given'].includes(s.keyword)).map(s => s.text).join('\n'),
    steps: scenario.steps
      .filter(s => !['Dado','Given'].includes(s.keyword))
      .map((s, i) => ({
        order:           i + 1,
        action:          `${s.keyword} ${s.text}`,
        expected_result: ['Então','Then'].includes(s.keyword) ? s.text : '',
      })),
    tags:        [...(scenario.tags || []), `jira:${jiraKey}`, `type:${scenario.type}`].join(','),
    priority:    scenario.type === 'happy_path' ? 'high' : 'medium',
    automation:  'manual',
    project_id:  projectId,
    squad_id:    squadId,
    jira_key:    jiraKey,
    gherkin_text: toGherkinText({ feature: gherkinJson.feature, scenarios: [scenario] }),
  }));
}

async function suggestImprovements(gherkinText) {
  return callGroq(`Analise estes cenários Gherkin e sugira melhorias de cobertura e boas práticas BDD. Responda em português.\n\n${gherkinText}`);
}

module.exports = { generateGherkin, toGherkinText, gherkinToTestCases, suggestImprovements };
