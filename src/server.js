require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const routes  = require('./routes');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
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

// Handler de erros global — captura qualquer erro nao tratado
app.use((err, req, res, next) => {
  console.error('ERROR:', err.message);

  // Erro de FK do MySQL
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({
      error: 'Referencia invalida',
      detail: 'Um dos IDs fornecidos nao existe no banco de dados',
      sql_message: err.sqlMessage
    });
  }

  // Entrada duplicada
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      error: 'Registro duplicado',
      detail: err.sqlMessage
    });
  }

  res.status(500).json({ error: 'Erro interno do servidor', detail: err.message });
});

app.listen(PORT, () => {
  console.log(`TestHub API rodando em http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
