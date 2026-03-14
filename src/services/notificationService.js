/**
 * src/services/notificationService.js
 * 
 * Notificações para Microsoft Teams e Email
 * npm install nodemailer
 */

const https   = require('https');
const http    = require('http');
const nodemailer = require('nodemailer');

const TEAMS_WEBHOOK = process.env.TEAMS_WEBHOOK_URL;
const FRONTEND_URL  = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── Microsoft Teams ───────────────────────────────────────────

function sendTeamsCard(card) {
  return new Promise((resolve, reject) => {
    if (!TEAMS_WEBHOOK) return resolve();
    const body   = JSON.stringify(card);
    const url    = new URL(TEAMS_WEBHOOK);
    const lib    = url.protocol === 'https:' ? https : http;
    const req    = lib.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      res.on('data', () => {});
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Cards Teams por evento ────────────────────────────────────

async function notifyNewStory({ jiraKey, summary, scenariosCount, testCaseIds, squadName }) {
  const card = {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
        type:    'AdaptiveCard',
        version: '1.4',
        body: [
          {
            type: 'Container',
            style: 'emphasis',
            items: [{
              type: 'TextBlock',
              text: '🎯 Nova História — Cenários Gerados',
              weight: 'Bolder',
              size: 'Medium',
              color: 'Accent',
            }],
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Jira',    value: `**${jiraKey}**` },
              { title: 'História', value: summary },
              { title: 'Squad',    value: squadName || 'Não definido' },
              { title: 'Cenários', value: `✅ ${scenariosCount} cenários Gherkin gerados` },
            ],
          },
          {
            type: 'TextBlock',
            text: '⚠️ Revise e aprove os cenários no TestHub antes de iniciar o ciclo.',
            wrap: true,
            color: 'Warning',
          },
        ],
        actions: [
          { type: 'Action.OpenUrl', title: '📋 Ver Casos de Teste', url: `${FRONTEND_URL}/test-cases?jira=${jiraKey}` },
          { type: 'Action.OpenUrl', title: '🔗 Ver no Jira',        url: `${process.env.JIRA_URL}/browse/${jiraKey}` },
        ],
      },
    }],
  };
  await sendTeamsCard(card);
}

async function notifyCycleResult({ jiraKey, summary, passed, failed, total, cycleId, squadName }) {
  const passRate = total ? Math.round(passed / total * 100) : 0;
  const emoji    = passRate === 100 ? '✅' : passRate >= 70 ? '⚠️' : '🔴';
  const color    = passRate === 100 ? 'Good' : passRate >= 70 ? 'Warning' : 'Attention';

  const card = {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
        type:    'AdaptiveCard',
        version: '1.4',
        body: [
          {
            type: 'Container',
            style: 'emphasis',
            items: [{
              type:   'TextBlock',
              text:   `${emoji} Ciclo de Testes Concluído`,
              weight: 'Bolder',
              size:   'Medium',
              color,
            }],
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Jira',      value: `**${jiraKey}** — ${summary}` },
              { title: 'Squad',     value: squadName || 'Não definido' },
              { title: 'Passou',    value: `${passed}/${total} (${passRate}%)` },
              { title: 'Falhou',    value: String(failed) },
              { title: 'Resultado', value: passRate === 100 ? '🟢 Aprovado' : '🔴 Reprovado' },
            ],
          },
        ],
        actions: [
          { type: 'Action.OpenUrl', title: '📊 Ver Relatório', url: `${FRONTEND_URL}/reports?cycle=${cycleId}` },
          { type: 'Action.OpenUrl', title: '🔗 Ver no Jira',   url: `${process.env.JIRA_URL}/browse/${jiraKey}` },
        ],
      },
    }],
  };
  await sendTeamsCard(card);
}

async function notifyBugCreated({ jiraKey, bugKey, testCaseName, executionId, squadName }) {
  const card = {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content: {
        '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
        type:    'AdaptiveCard',
        version: '1.4',
        body: [
          {
            type: 'Container',
            style: 'attention',
            items: [{
              type:   'TextBlock',
              text:   '🐛 Bug Criado Automaticamente',
              weight: 'Bolder',
              size:   'Medium',
              color:  'Attention',
            }],
          },
          {
            type: 'FactSet',
            facts: [
              { title: 'Story',      value: jiraKey },
              { title: 'Bug',        value: `**${bugKey}**` },
              { title: 'Caso',       value: testCaseName },
              { title: 'Squad',      value: squadName || 'Não definido' },
            ],
          },
        ],
        actions: [
          { type: 'Action.OpenUrl', title: '🔍 Ver Execução',  url: `${FRONTEND_URL}/executions/${executionId}` },
          { type: 'Action.OpenUrl', title: '🐛 Ver Bug Jira',  url: `${process.env.JIRA_URL}/browse/${bugKey}` },
        ],
      },
    }],
  };
  await sendTeamsCard(card);
}

// ── Email ─────────────────────────────────────────────────────

function getMailer() {
  return nodemailer.createTransporter({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.SMTP_USER) return;
  const mailer = getMailer();
  await mailer.sendMail({
    from:    `"TestHub Bot" <${process.env.SMTP_USER}>`,
    to:      Array.isArray(to) ? to.join(',') : to,
    subject,
    html,
  });
}

async function emailNewStory({ to, jiraKey, summary, scenariosCount }) {
  await sendEmail({
    to,
    subject: `[TestHub] Nova Story ${jiraKey} — ${scenariosCount} cenários gerados`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <div style="background:#6366f1;color:#fff;padding:20px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">🎯 Nova História de Usuário</h2>
        </div>
        <div style="background:#f8f9fa;padding:20px;border-radius:0 0 8px 8px">
          <p><strong>Jira:</strong> ${jiraKey}</p>
          <p><strong>História:</strong> ${summary}</p>
          <p style="color:#22c55e"><strong>✅ ${scenariosCount} cenários Gherkin foram gerados automaticamente.</strong></p>
          <p>Acesse o TestHub para revisar e aprovar os cenários antes de iniciar o ciclo de testes.</p>
          <a href="${FRONTEND_URL}/test-cases?jira=${jiraKey}"
             style="display:inline-block;background:#6366f1;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;margin-top:10px">
            Ver Casos de Teste
          </a>
        </div>
      </div>
    `,
  });
}

module.exports = {
  notifyNewStory,
  notifyCycleResult,
  notifyBugCreated,
  sendEmail,
  emailNewStory,
};
