/**
 * Middlewares de segurança e proteção
 * - Rate limiting por endpoint
 * - CORS configurável
 * - Verificação de assinatura Jira webhook
 */

const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// ═════════════════════════════════════════════════════════════════
// RATE LIMITERS
// ═════════════════════════════════════════════════════════════════

// Rate limiter global - aplicado em toda API
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requisições por IP
  message: 'Muitas requisições deste IP, tente novamente mais tarde',
  standardHeaders: true, // Retorna rate limit em RateLimit-* headers
  legacyHeaders: false,
  skip: (req) => {
    // Não limita requisições de health check
    return req.path === '/health';
  }
});

// Rate limiter para login - muito mais restritivo
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Máximo 5 tentativas
  message: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
  skipSuccessfulRequests: true, // Resets count on successful request
});

// Rate limiter para registro
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // Máximo 3 registros por IP por hora
  message: 'Limite de registros excedido. Tente novamente mais tarde.',
});

// Rate limiter para operações de escrita (POST, PUT, DELETE)
const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30, // 30 operações por minuto
  message: 'Limite de operações excedido. Espere um minuto.',
  skip: (req) => {
    // Apenas aplica em POST, PUT, DELETE
    return !['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
  }
});

// ═════════════════════════════════════════════════════════════════
// CORS CONFIGURATION
// ═════════════════════════════════════════════════════════════════

const corsOptions = {
  origin: (origin, callback) => {
    // Allow-list de origins permitidos
    const allowedOrigins = [
      'http://localhost:3000',      // Dev local
      'http://localhost:5173',      // Vite dev
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      process.env.FRONTEND_URL,     // Produção
      process.env.FRONTEND_URL_DEV, // Staging
    ].filter(Boolean);

    // Em desenvolvimento, aceita qualquer origem (comentado em produção)
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS não permitido para esta origem'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400, // 24 horas
};

// ═════════════════════════════════════════════════════════════════
// JIRA WEBHOOK VERIFICATION
// ═════════════════════════════════════════════════════════════════

/**
 * Verifica a assinatura do webhook do Jira
 * Jira envia X-Atlassian-Webhook-Signature header com HMAC-SHA256
 */
const verifyJiraWebhookSignature = (req, res, next) => {
  const signature = req.headers['x-atlassian-webhook-signature'];
  const secret = process.env.JIRA_WEBHOOK_SECRET;

  // Se não há secret configurado, log warning mas permite em dev
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({
        error: 'Webhook secret não configurado'
      });
    }
    console.warn('[WARN] JIRA_WEBHOOK_SECRET não configurado - webhook desprotegido');
    return next();
  }

  // Se requisição não tem assinatura, rejeita
  if (!signature) {
    return res.status(401).json({
      error: 'Assinatura do webhook ausente'
    });
  }

  try {
    // Reconstruct request body como string para verificar assinatura
    const body = req.rawBody || JSON.stringify(req.body);
    
    // Calcular HMAC-SHA256
    const hash = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('base64');

    // Comparar assinatura
    if (signature !== hash) {
      return res.status(401).json({
        error: 'Assinatura do webhook inválida'
      });
    }

    next();
  } catch (err) {
    console.error('[ERROR] Falha ao verificar webhook Jira:', err.message);
    res.status(400).json({
      error: 'Erro ao verificar assinatura'
    });
  }
};

// ═════════════════════════════════════════════════════════════════
// SECURITY HEADERS
// ═════════════════════════════════════════════════════════════════

const securityHeaders = (req, res, next) => {
  // Previne clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Previne MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Ativa XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy (básico)
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  
  next();
};

// ═════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════

module.exports = {
  globalLimiter,
  loginLimiter,
  registerLimiter,
  writeLimiter,
  corsOptions,
  verifyJiraWebhookSignature,
  securityHeaders,
};
