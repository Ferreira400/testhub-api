# 🚀 TestHub API — Guia de Uso

## Setup e execução

```bash
# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run dev

# Rodar em produção
npm start
```

> A API sobe em `http://localhost:3001`

---

## 🔐 Autenticação

Todas as rotas (exceto login/register) exigem o header:
```
Authorization: Bearer <token>
```

### Registrar usuário
```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"João QA","email":"joao@testhub.io","password":"123456","role":"qa_engineer"}'
```

### Login
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"joao@testhub.io","password":"123456"}'
```
> Retorna `{ token, user }` — use o token nas próximas chamadas.

### Meu perfil
```bash
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## 👥 Squads

### Listar squads
```bash
curl http://localhost:3001/api/squads \
  -H "Authorization: Bearer SEU_TOKEN"
```

### Criar squad
```bash
curl -X POST http://localhost:3001/api/squads \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Squad D","description":"Novos integrantes","color_hex":"#EF4444"}'
```

### Adicionar membro à squad
```bash
curl -X POST http://localhost:3001/api/squads/SQUAD_ID/members \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"USER_ID","squad_role":"member"}'
```

---

## 📁 Projetos

### Criar projeto
```bash
curl -X POST http://localhost:3001/api/projects \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "squad_id": "SQUAD_ID",
    "name": "Portal Web",
    "key": "PW",
    "description": "Testes do portal web"
  }'
```

### Listar por squad
```bash
curl "http://localhost:3001/api/projects?squad_id=SQUAD_ID" \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## 🧪 Casos de Teste

### Criar caso de teste manual
```bash
curl -X POST http://localhost:3001/api/test-cases \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "PROJECT_ID",
    "title": "Login com credenciais válidas",
    "type": "manual",
    "priority": "critical",
    "preconditions": "Usuário cadastrado no sistema",
    "steps": [
      {"action": "Acessar /login", "expected_result": "Página de login exibida"},
      {"action": "Preencher email e senha válidos", "expected_result": "Campos preenchidos"},
      {"action": "Clicar em Entrar", "expected_result": "Redirecionado ao dashboard"}
    ]
  }'
```

### Criar caso automatizado
```bash
curl -X POST http://localhost:3001/api/test-cases \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "PROJECT_ID",
    "title": "Validar API de autenticação",
    "type": "automated",
    "priority": "high",
    "automation_status": "automated"
  }'
```

### Filtrar casos por tipo/status
```bash
curl "http://localhost:3001/api/test-cases?project_id=ID&type=manual&priority=critical" \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## 🔄 Ciclos de Teste

### Criar ciclo
```bash
curl -X POST http://localhost:3001/api/test-cycles \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_id": "PLAN_ID",
    "name": "Sprint 15 - Regressão",
    "environment": "staging",
    "build_version": "v2.1.0",
    "case_ids": ["CASE_ID_1", "CASE_ID_2"]
  }'
```

---

## ▶️ Execuções

### Registrar execução manual
```bash
curl -X POST http://localhost:3001/api/executions \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cycle_id": "CYCLE_ID",
    "test_case_id": "CASE_ID",
    "squad_id": "SQUAD_ID",
    "status": "passed",
    "execution_type": "manual",
    "duration_seconds": 120,
    "comments": "Executado sem erros",
    "step_results": [
      {"step_id": "STEP_ID_1", "status": "passed", "actual_result": "Página exibida corretamente"},
      {"step_id": "STEP_ID_2", "status": "passed"}
    ]
  }'
```

### Registrar falha
```bash
curl -X POST http://localhost:3001/api/executions \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cycle_id": "CYCLE_ID",
    "test_case_id": "CASE_ID",
    "squad_id": "SQUAD_ID",
    "status": "failed",
    "comments": "Erro 500 ao submeter formulário"
  }'
```

### Filtrar execuções por usuário e squad
```bash
curl "http://localhost:3001/api/executions?squad_id=SQUAD_ID&status=failed" \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## 📊 Relatórios

### Dashboard geral
```bash
curl "http://localhost:3001/api/reports/dashboard?project_id=PROJECT_ID" \
  -H "Authorization: Bearer SEU_TOKEN"
```

### Relatório por ciclo
```bash
curl http://localhost:3001/api/reports/cycle/CYCLE_ID \
  -H "Authorization: Bearer SEU_TOKEN"
```

### Relatório por squad (últimos 30 dias)
```bash
curl "http://localhost:3001/api/reports/squad/SQUAD_ID?days=30" \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## 📋 Tabela de Endpoints

| Método | Rota | Descrição |
|---|---|---|
| POST | /api/auth/register | Registrar usuário |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Perfil autenticado |
| GET | /api/users | Listar usuários |
| GET | /api/squads | Listar squads |
| POST | /api/squads | Criar squad |
| POST | /api/squads/:id/members | Adicionar membro |
| GET | /api/projects | Listar projetos |
| POST | /api/projects | Criar projeto |
| GET | /api/test-cases | Listar casos |
| POST | /api/test-cases | Criar caso de teste |
| PUT | /api/test-cases/:id | Atualizar caso |
| GET | /api/test-cycles | Listar ciclos |
| POST | /api/test-cycles | Criar ciclo |
| GET | /api/executions | Listar execuções |
| POST | /api/executions | Registrar execução |
| GET | /api/reports/dashboard | Dashboard geral |
| GET | /api/reports/cycle/:id | Relatório por ciclo |
| GET | /api/reports/squad/:id | Relatório por squad |
