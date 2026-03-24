# TestHub — Agente de Desenvolvimento

## Identidade
Você é o agente de desenvolvimento do projeto **TestHub**, uma plataforma completa de gestão de cenários de teste QA desenvolvida com Node.js, React e MySQL.

## Stack Tecnológica

### Backend
- **Runtime**: Node.js v20 + Express.js
- **Banco**: MySQL 8.0 via mysql2 com connection pool
- **Auth**: Keycloak SSO (PKCE + JWKS) com modo híbrido JWT local
- **IA**: Groq API (llama3) para geração de Gherkin
- **Integração**: Jira Cloud via webhook bidirecional + REST API
- **Containers**: Podman + podman-compose

### Frontend
- **Framework**: React 18 + Vite 5
- **Estilo**: CSS variables dark theme (sem Tailwind, sem MUI)
- **HTTP**: Axios via `src/services/api.js` com baseURL `/api`
- **Auth**: Keycloak PKCE flow via `src/context/AuthContext.jsx`
- **Charts**: Recharts
- **Excel**: SheetJS (xlsx)

## Estrutura do Projeto

```
TestHUB/
├── testhub-api/
│   └── src/
│       ├── server.js              # Entry point Express
│       ├── config/db.js           # MySQL pool
│       ├── middlewares/auth.js    # JWT + Keycloak JWKS
│       ├── routes/index.js        # Todas as rotas sob /api
│       └── controllers/
│           ├── authController.js
│           ├── usersController.js
│           ├── squadsController.js
│           ├── projectsController.js
│           ├── testCasesController.js
│           ├── testCyclesController.js
│           ├── executionsController.js
│           ├── reportsController.js
│           ├── jiraController.js
│           ├── bugController.js
│           ├── businessUnitsController.js
│           └── coverageController.js
├── testhub-front/
│   └── src/
│       ├── App.jsx                # Rotas React
│       ├── context/AuthContext.jsx
│       ├── services/api.js        # Axios instance
│       ├── components/
│       │   └── BusinessUnitSelector.jsx
│       └── pages/
│           ├── Dashboard.jsx
│           ├── Squads.jsx
│           ├── Projects.jsx
│           ├── TestCases.jsx
│           ├── Cycles.jsx
│           ├── Executions.jsx
│           ├── Reports.jsx
│           ├── Jira.jsx
│           ├── Bugs.jsx
│           ├── BusinessUnits.jsx
│           ├── CoverageReport.jsx
│           └── Profile.jsx
└── docker/
    ├── start.ps1                  # Start Windows
    ├── start.sh                   # Start Mac/Linux
    ├── podman-compose.yml
    ├── Dockerfile.api
    └── Dockerfile.frontend
```

## Banco de Dados — Tabelas Principais

```sql
users              -- id (uuid), name, email, password_hash, role, is_active
squads             -- id, name, description, color_hex, created_by
squad_members      -- id, squad_id, user_id, squad_role (lead|member)
projects           -- id, squad_id, name, key, status, created_by
test_cases         -- id, code, title, description, priority, type, automation_status,
                   --   project_id, business_unit_id, jira_key, status, created_by
test_steps         -- id, test_case_id, step_order, action, expected_result
test_plans         -- id, project_id, squad_id, name, status, owner_id
test_cycles        -- id, plan_id, name, environment, build_version, status
test_cycle_cases   -- id, cycle_id, test_case_id, status
test_executions    -- id, test_case_id, cycle_id, status (passed|failed|blocked|skipped),
                   --   executed_by, jira_bug_key, retest_requested_at
execution_step_results -- id, execution_id, step_id, status, actual_result
bug_links          -- id, jira_bug_key, jira_story_key, test_case_id, execution_id,
                   --   cycle_id, squad_id, status (open|in_progress|resolved|closed|retest_pending)
jira_links         -- id, jira_key, test_case_id, type
business_units     -- id, capacidade, dominio, sub_dominio, produto, aplicacao,
                   --   processo_negocio, impacto (baixo|medio|alto), componentes, ativo
audit_logs         -- id, user_id, action, entity_type, entity_id, old_value, new_value
```

## Padrões de Código

### Controller Backend (padrão)
```javascript
exports.list = async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT * FROM tabela WHERE ativo = 1`)
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
```

### Rota Frontend (padrão)
```javascript
// Em routes/index.js — SEMPRE adicionar aqui, nunca no server.js diretamente
const ctrl = require('../controllers/meuController')
router.get('/meu-recurso',     auth, ctrl.list)
router.get('/meu-recurso/:id', auth, ctrl.getById)
router.post('/meu-recurso',    auth, ctrl.create)
router.put('/meu-recurso/:id', auth, ctrl.update)
```

### Chamada API Frontend (padrão)
```javascript
import api from '../services/api'
// api já tem baseURL /api configurado
const res = await api.get('/meu-recurso')          // GET /api/meu-recurso
const res = await api.post('/meu-recurso', dados)  // POST /api/meu-recurso
```

### Componente React (padrão)
```javascript
import React, { useState, useEffect } from 'react'
import api from '../services/api'
import Layout from '../../Layout'

export default function MinhaPagina() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await api.get('/meu-recurso')
      setData(res.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  return <Layout>...</Layout>
}
```

## Fluxos Importantes

### Fluxo Bug Tracking
1. Execução com status `failed` → `bugService.createBugFromExecution()`
2. Bug criado no Jira com labels `testhub-auto, qa-failure`
3. Webhook Jira → `jiraController.handleWebhook()`
4. Status map: `to do→open`, `in progress→in_progress`, `done→resolved`
5. Ao resolver: nova execução `retest_pending` criada automaticamente

### Fluxo Gherkin via IA
1. Story criada no Jira → webhook dispara
2. `jiraController.handleWebhook()` → `groqService.generateGherkin()`
3. Casos criados com `jira_key` vinculado

### Auth Middleware
```javascript
// req.user após autenticação:
{
  id: 'uuid-do-keycloak-ou-local',
  email: 'user@email.com',
  name: 'Nome do Usuário',
  role: 'admin|manager|qa_engineer|viewer',
  roles: ['admin', ...],
  source: 'keycloak|local'
}
```

## Roles e Permissões
- `admin` — acesso total
- `manager` — gerenciar squads, projetos, ciclos, relatórios
- `qa_engineer` — criar/executar casos, registrar bugs
- `viewer` — somente leitura

## Variáveis de Ambiente (.env)
```
PORT=3001
DB_HOST=localhost / testhub-mysql (container)
DB_PORT=3306
DB_USER=root
DB_PASSWORD=adm
DB_NAME=testhub
JWT_SECRET=testhub_secret_key_2026
JWT_EXPIRES_IN=8h
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=testhub
KEYCLOAK_HYBRID=true
JIRA_URL=https://seu-dominio.atlassian.net
JIRA_EMAIL=seu@email.com
JIRA_API_TOKEN=seu_token
JIRA_PROJECT_KEY=TH
GROQ_API_KEY=seu_token_groq
FRONTEND_URL=http://localhost:3000
```

## Portas
- Frontend dev: `http://localhost:5173`
- Frontend prod (container): `http://localhost:3000`
- API: `http://localhost:3001`
- Keycloak: `http://localhost:8080`
- MySQL: `localhost:3306`

## Comandos Úteis

### Desenvolvimento local
```bash
# API
cd testhub-api && npm run dev

# Frontend
cd testhub-front && npm run dev
```

### Containers (Windows)
```powershell
# Subir tudo
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\docker\start.ps1

# Parar
podman stop testhub-mysql testhub-keycloak-db testhub-keycloak testhub-api testhub-frontend

# Logs
podman logs testhub-api -f
podman logs testhub-frontend -f
```

### Banco de dados
```powershell
# Importar schema
Get-Content schema.sql | podman exec -i testhub-mysql mysql -u root -padm testhub

# Importar backup
Get-Content dump-testhub-*.sql | podman exec -i testhub-mysql mysql -u root -padm testhub

# Query direta
podman exec testhub-mysql mysql -u root -padm -e "SELECT COUNT(*) FROM test_cases;" testhub
```

## Regras do Agente

1. **Sempre use `routes/index.js`** para registrar novas rotas — nunca adicione diretamente no `server.js`
2. **Encoding**: evite caracteres especiais em scripts PowerShell (use strings simples sem `—`, `→`, emojis)
3. **CSS**: use sempre CSS variables (`var(--text-pri)`, `var(--bg-card)`, `var(--border)`, etc.) nunca cores hardcoded
4. **Modal**: sempre use `position: fixed` com `zIndex: 9999` para modais funcionarem corretamente
5. **Auth**: o `req.user.id` vem do Keycloak e pode não bater com o banco — sempre busque o usuário pelo email quando necessário
6. **FK errors**: ao criar registros, verifique se o `created_by` existe na tabela `users`
7. **Imports no React**: coloque TODOS os imports no topo do arquivo, antes de qualquer código
8. **Vite proxy**: o frontend usa proxy `/api → localhost:3001`, então nas chamadas axios use `/recurso` não `/api/recurso`
9. **Duplicidade**: sempre adicione `UNIQUE KEY` nas tabelas para evitar duplicatas na importação
10. **business_unit_id**: campo obrigatório em `test_cases` — sempre incluir no INSERT e nos formulários

## Erros Comuns e Soluções

| Erro | Causa | Solução |
|------|-------|---------|
| `Cannot find module` | Controller não copiado para pasta correta | Copiar arquivo para `src/controllers/` |
| `Column count doesn't match` | INSERT com colunas e valores diferentes | Contar `?` e valores no array |
| `ER_NO_REFERENCED_ROW_2` | FK inválida | Verificar se o ID existe na tabela referenciada |
| `502 Bad Gateway` | API não está na mesma rede do nginx | Verificar rede do container com `podman network ls` |
| `401 Unauthorized` | Token Keycloak com ID diferente do banco | Atualizar ID do usuário no banco com `SET FOREIGN_KEY_CHECKS=0` |
| `EBUSY locked` | Arquivo aberto pelo PowerShell | Fechar terminal e reabrir |
| `Position: fixed não funciona` | Modal dentro de elemento com transform | Usar `position: fixed` com `inset: 0` e `zIndex: 9999` |

---

## SECURITY IMPROVEMENTS — IMPLEMENTADAS (v1.0.5)

### Commit: `85813bd` — Validação, Rate Limiting e CORS

#### Novos Arquivos Criados:
1. **`src/utils/validators.js`** — Centralização de regras de validação com express-validator
   - `authValidators.register` — Valida nome, email, senha (min 6, maiúscula, minúscula)
   - `authValidators.login` — Valida email e senha
   - `uuidValidator` — Valida UUIDs em params
   - `paginationValidator` — Valida page e limit em queries
   - `squadsValidators`, `projectsValidators`, etc. — Por domínio
   - Middleware `handleValidationErrors` — Centraliza tratamento de erros

2. **`src/middlewares/security.js`** — Middlewares de segurança e proteção
   - `globalLimiter` — 100 req/15min por IP (aplica em `/api` globalmente)
   - `loginLimiter` — 5 tentativas/15min (skipSuccessfulRequests: true)
   - `registerLimiter` — 3 registros/hora por IP
   - `writeLimiter` — 30 ops/min (POST, PUT, DELETE, PATCH)
   - `corsOptions` — Allow-list configurável por NODE_ENV
     * Dev: aceita todas as origens (localhost:3000, localhost:5173, 127.0.0.1)
     * Prod: via variáveis `FRONTEND_URL` e `FRONTEND_URL_DEV`
   - `verifyJiraWebhookSignature` — Valida HMAC-SHA256 do webhook Jira (X-Atlassian-Webhook-Signature)
   - `securityHeaders` — Headers de proteção (X-Frame-Options, CSP, X-XSS-Protection, etc.)

#### Modificações em Arquivos Existentes:

**`src/server.js`**:
```javascript
// Adicionado após require('dotenv')
const { corsOptions, globalLimiter, securityHeaders } = require('./middlewares/security')

// Aplicado na sequência correta:
app.use(securityHeaders)     // Headers primeiro
app.use(globalLimiter)       // Rate limit global
app.use(cors(corsOptions))   // CORS restritivo
app.use(express.json({       // Body parser com capture de rawBody para Jira
  verify: (req, res, buf, encoding) => {
    req.rawBody = buf.toString(encoding || 'utf8')
  }
}))

// Error handler melhorado:
// - Diferencia erros MySQL vs validacao vs genérico
// - Mascara stack trace em produção (NODE_ENV !== 'development')
// - Logs estruturados com timestamp
```

**`src/routes/index.js`**:
```javascript
// Imports adicionados
const { loginLimiter, registerLimiter, verifyJiraWebhookSignature } = require('../middlewares/security')
const { authValidators, squadsValidators, projectsValidators, ... } = require('../utils/validators')

// Auth com validação e rate limiting
router.post('/auth/register', registerLimiter, authValidators.register, authCtrl.register)
router.post('/auth/login',    loginLimiter,    authValidators.login,    authCtrl.login)

// Jira webhook PROTEGIDO
router.post('/jira/webhook', verifyJiraWebhookSignature, jiraCtrl.handleWebhook)
```

#### Variáveis de Ambiente Adicionadas (.env):
```
# Security
NODE_ENV=development|production

# CORS configurável
FRONTEND_URL=https://testhub.producao.com
FRONTEND_URL_DEV=https://testhub-staging.com

# Jira Webhook Secret (gerar com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JIRA_WEBHOOK_SECRET=<seu-secret-aleatorio-64-chars>
```

#### Impacto & Comportamento:
✅ **Auth routes** — Protegidas contra brute force (max 5 tentativas login / 3 registros por hora)
✅ **Jira webhook** — Rejeita requisições sem assinatura válida (HMAC-SHA256)
✅ **CORS** — Apenas origins da allow-list conseguem fazer requisições
✅ **Validação** — Email, senha, UUIDs validados antes de chegar no controller
✅ **Error messages** — Detalhes completos em dev, mensagens simples em prod
✅ **Performance** — Rate limiting evita DDoS e force brute attacks

#### Próximas Implementações (v1.0.6):
- [ ] Adicionar try-catch em TODOS os controllers
- [ ] Repository Pattern para abstrair DB
- [ ] Testes unitários (Jest + Supertest)
- [ ] Caching com Redis
- [ ] Paginação mandatória em GET /list
- [ ] Logging com Pino (estruturado)

