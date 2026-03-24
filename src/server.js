require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const routes  = require('./routes');
const {
  corsOptions,
  globalLimiter,
  securityHeaders,
} = require('./middlewares/security');

const app  = express();
const PORT = process.env.PORT || 3001;

// ────────────────────────────────────────────────────────────────
// SEGURANÇA & HEADERS
// ────────────────────────────────────────────────────────────────
app.use(securityHeaders); // Security headers (X-Frame-Options, CSP, etc)
app.use(globalLimiter);   // Rate limiting global

// ────────────────────────────────────────────────────────────────
// CORS CONFIGURÁVEL
// ────────────────────────────────────────────────────────────────
app.use(cors(corsOptions));

// ────────────────────────────────────────────────────────────────
// BODY PARSING
// ────────────────────────────────────────────────────────────────
// Captura raw body para verificação de webhook Jira
app.use(express.json({
  verify: (req, res, buf, encoding) => {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
}));

app.use('/api/coverage', require('./routes/coverageRoutes'))

// Wrap async route handlers — captura erros e passa para o handler global
const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Exporta para uso nos controllers
app.set('asyncHandler', asyncHandler);

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', service: 'TestHub API', ts: new Date() }));

// Todas as rotas sob /api
app.use('/api', routes);

// ────────────────────────────────────────────────────────────────
// GLOBAL ERROR HANDLER
// ────────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const isDev = process.env.NODE_ENV === 'development';
  
  // Log completo do erro (sempre)
  console.error('[ERROR]', {
    message: err.message,
    code: err.code,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    ...(isDev && { stack: err.stack })
  });

  // Erro de CORS
  if (err.message?.includes('CORS')) {
    return res.status(403).json({
      error: 'CORS erro',
      detail: 'Origem não permitida'
    });
  }

  // Erro de FK do MySQL
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({
      error: 'Referência inválida',
      detail: 'Um dos IDs fornecidos não existe',
      ...(isDev && { raw: err.sqlMessage })
    });
  }

  // Entrada duplicada
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      error: 'Registro duplicado',
      ...(isDev && { detail: err.sqlMessage })
    });
  }

  // Rate limit (express-rate-limit)
  if (err.status === 429) {
    return res.status(429).json({
      error: 'Rate limit excedido',
      detail: 'Muitas requisições. Tente novamente mais tarde'
    });
  }

  // Erro de validação (express-validator)
  if (err.array && typeof err.array === 'function') {
    return res.status(400).json({
      error: 'Validação falhou',
      errors: err.array()
    });
  }

  // Erro genérico
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Erro interno do servidor',
    ...(isDev && { 
      detail: err.message,
      stack: err.stack?.split('\n').slice(0, 5)
    })
  });
});

app.listen(PORT, () => {
  console.log(`TestHub API rodando em http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
