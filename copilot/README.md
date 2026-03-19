# TestHub — Agente VS Code + GitHub Copilot

## O que é isso?

Esta pasta contém os arquivos de configuração para o GitHub Copilot conhecer todo o projeto TestHub e te ajudar a desenvolver com contexto completo.

---

## Passo a Passo para Configurar

### 1. Instale as extensões necessárias

Abra o VS Code e instale:

- **GitHub Copilot** — `ext install GitHub.copilot`
- **GitHub Copilot Chat** — `ext install GitHub.copilot-chat`
- **REST Client** — `ext install humao.rest-client` (para testar a API)

Ou abra o VS Code, pressione `Ctrl+Shift+X` e busque cada extensão.

### 2. Copie os arquivos para o projeto

Copie as pastas `.github` e `.vscode` para a raiz do TestHUB:

```powershell
# Windows
xcopy /E /I ".github" "C:\Users\rodri\Downloads\TestHUB\.github"
xcopy /E /I ".vscode" "C:\Users\rodri\Downloads\TestHUB\.vscode"
copy "testhub.http" "C:\Users\rodri\Downloads\TestHUB\testhub.http"
```

```bash
# Mac/Linux
cp -r .github ~/Downloads/TestHUB/
cp -r .vscode ~/Downloads/TestHUB/
cp testhub.http ~/Downloads/TestHUB/
```

### 3. Abra o projeto como workspace

```powershell
code "C:\Users\rodri\Downloads\TestHUB"
```

**IMPORTANTE**: Abra a pasta raiz `TestHUB` e não as subpastas individualmente.

### 4. Faça login no GitHub Copilot

- Pressione `Ctrl+Shift+P`
- Digite `GitHub Copilot: Sign In`
- Siga as instruções

---

## Como Usar o Copilot com o Agente

### Chat do Copilot (Ctrl+Alt+I ou clique no ícone de chat)

O Copilot agora conhece toda a arquitetura do TestHub. Você pode perguntar:

**Exemplos de perguntas:**

```
"Crie um controller para gerenciar ambientes de teste"
```
```
"Adicione um campo de 'versão' nos ciclos de teste com migration SQL"
```
```
"Crie uma tela React para listar execuções com filtro por status"
```
```
"Por que está dando erro de FK ao criar um caso de teste?"
```
```
"Gere um cenário Gherkin para o fluxo de recuperação de senha"
```
```
"Como adiciono uma nova rota no backend do TestHub?"
```

### Sugestões inline (Tab para aceitar)

Enquanto você digita código, o Copilot vai sugerir automaticamente seguindo os padrões do TestHub.

### Comandos úteis no chat:

| Comando | O que faz |
|---------|-----------|
| `/explain` | Explica o código selecionado |
| `/fix` | Corrige erros no código selecionado |
| `/tests` | Gera testes para o código selecionado |
| `/doc` | Gera documentação JSDoc |

---

## Arquivo testhub.http — Testar a API

O arquivo `testhub.http` permite testar todos os endpoints da API diretamente no VS Code:

1. Abra o arquivo `testhub.http`
2. Clique em **Send Request** acima de qualquer requisição
3. O resultado aparece na lateral direita

**Para usar com autenticação:**
1. Execute o request de login
2. Copie o token retornado
3. Cole em `@token = SEU_TOKEN_AQUI` no topo do arquivo

---

## Estrutura dos Arquivos

```
TestHUB/
├── .github/
│   └── copilot-instructions.md   ← Instruções do agente (não edite)
├── .vscode/
│   ├── settings.json             ← Configurações do VS Code
│   └── extensions.json           ← Extensões recomendadas
└── testhub.http                  ← REST Client para testar API
```

---

## Dicas de Uso

1. **Sempre abra o projeto pela pasta raiz** — o Copilot lê o arquivo `.github/copilot-instructions.md` automaticamente

2. **Seja específico nas perguntas** — quanto mais contexto você der, melhor a resposta:
   - RUIM: "Crie uma tela"
   - BOM: "Crie uma tela React para gerenciar ambientes de teste, seguindo o padrão das outras páginas do TestHub com Layout, useState, api.get e modal de criação"

3. **Use `@workspace` no chat** para o Copilot analisar todos os arquivos:
   ```
   @workspace Como está implementado o fluxo de bug tracking?
   ```

4. **Selecione código antes de perguntar** — o Copilot usa o código selecionado como contexto

5. **Para erros de banco** — cole o erro completo no chat:
   ```
   Estou com este erro no MySQL: [cole o erro aqui]
   Como corrijo no contexto do TestHub?
   ```
