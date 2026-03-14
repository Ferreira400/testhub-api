/**
 * middleware/keycloak.js
 * 
 * Valida tokens JWT emitidos pelo Keycloak via JWKS endpoint.
 * Suporta modo híbrido: aceita tokens Keycloak OU tokens locais (JWT interno).
 * 
 * Instalar dependência:
 *   npm install jwks-rsa
 */

const jwt     = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');

const KEYCLOAK_URL   = process.env.KEYCLOAK_URL   || 'http://localhost:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'testhub';
const HYBRID_MODE    = process.env.KEYCLOAK_HYBRID !== 'false'; // true por padrão

// Cliente JWKS — busca chaves públicas do Keycloak e faz cache
const jwksClient = jwksRsa({
  jwksUri: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`,
  cache:           true,
  cacheMaxEntries: 10,
  cacheMaxAge:     600000,  // 10 minutos
  rateLimit:       true,
  jwksRequestsPerMinute: 10,
});

/**
 * Busca a chave pública do Keycloak pelo kid do header do token
 */
function getKeycloakKey(header, callback) {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

/**
 * Normaliza o payload do Keycloak para o formato interno do TestHub
 * Campo mapeado pelo protocol mapper "realm-roles-mapper" no realm.json
 */
function normalizeKeycloakPayload(payload) {
  const roles = payload.roles ||
    payload.realm_access?.roles ||
    [];

  // Determina a role principal (prioridade: admin > manager > qa_engineer > viewer)
  const PRIORITY = ['admin', 'manager', 'qa_engineer', 'viewer'];
  const role = PRIORITY.find(r => roles.includes(r)) || 'viewer';

  return {
    id:       payload.sub,
    email:    payload.email,
    name:     payload.name || `${payload.given_name || ''} ${payload.family_name || ''}`.trim(),
    role,
    roles,
    groups:   payload.groups || [],
    squad_id: payload.squad_id || null,
    source:   'keycloak',
  };
}

/**
 * Middleware principal de autenticação
 * Tenta validar como token Keycloak; se falhar e HYBRID_MODE=true, tenta o JWT local
 */
module.exports = async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = header.slice(7);

  // ── Tenta validar via Keycloak JWKS ───────────────────────
  try {
    const decoded = await new Promise((resolve, reject) => {
      jwt.verify(
        token,
        getKeycloakKey,
        {
          algorithms: ['RS256'],
          issuer:     `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
          audience:   ['testhub-frontend', 'testhub-api', 'account'],
        },
        (err, payload) => err ? reject(err) : resolve(payload)
      );
    });

    req.user   = normalizeKeycloakPayload(decoded);
    req.source = 'keycloak';
    return next();

  } catch (keycloakErr) {
    // Se o token claramente é do Keycloak (tem kid no header) → rejeita
    try {
      const decoded = jwt.decode(token, { complete: true });
      if (decoded?.header?.kid) {
        return res.status(401).json({
          error:  'Token Keycloak inválido ou expirado',
          detail: keycloakErr.message,
        });
      }
    } catch (_) {}

    // ── Modo híbrido: tenta JWT local ─────────────────────────
    if (HYBRID_MODE) {
      try {
        const local = jwt.verify(token, process.env.JWT_SECRET);
        req.user   = { ...local, source: 'local' };
        req.source = 'local';
        return next();
      } catch (localErr) {
        return res.status(401).json({ error: 'Token inválido ou expirado' });
      }
    }

    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};

/**
 * Middleware de autorização por role
 * Uso: router.get('/admin', auth, requireRole('admin'), handler)
 */
module.exports.requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
  const userRoles = req.user.roles || [req.user.role];
  const hasRole   = allowedRoles.some(r => userRoles.includes(r));
  if (!hasRole) {
    return res.status(403).json({
      error: 'Acesso negado',
      required: allowedRoles,
      current:  req.user.role,
    });
  }
  next();
};
