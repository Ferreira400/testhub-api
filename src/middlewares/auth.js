const jwt  = require("jsonwebtoken");
const https = require("https");
const http  = require("http");

const KEYCLOAK_URL   = process.env.KEYCLOAK_URL   || "http://localhost:8080";
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || "testhub";
const HYBRID_MODE    = process.env.KEYCLOAK_HYBRID !== "false";
const CERTS_URL      = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`;

let cachedKeys = null;
let cacheTime  = 0;

function fetchJwks() {
  return new Promise((resolve, reject) => {
    if (cachedKeys && Date.now() - cacheTime < 600000) return resolve(cachedKeys);
    const lib = CERTS_URL.startsWith("https") ? https : http;
    lib.get(CERTS_URL, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          cachedKeys = JSON.parse(data).keys;
          cacheTime  = Date.now();
          resolve(cachedKeys);
        } catch(e) { reject(e); }
      });
    }).on("error", reject);
  });
}

function jwkToPem(jwk) {
  const { createPublicKey } = require("crypto");
  return createPublicKey({ key: jwk, format: "jwk" }).export({ type: "spki", format: "pem" });
}

module.exports = async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token nao fornecido" });
  }
  const token = header.slice(7);

  // Tenta validar via Keycloak
  try {
    const decoded = jwt.decode(token, { complete: true });
    if (decoded?.header?.kid) {
      const keys = await fetchJwks();
      const jwk  = keys.find(k => k.kid === decoded.header.kid);
      if (!jwk) return res.status(401).json({ error: "Chave nao encontrada" });
      const pem  = jwkToPem(jwk);
      const payload = jwt.verify(token, pem, { algorithms: ["RS256"] });
      const roles = payload.roles || payload.realm_access?.roles || [];
      const PRIORITY = ["admin","manager","qa_engineer","viewer"];
      const role = PRIORITY.find(r => roles.includes(r)) || "viewer";
      req.user = {
        id:       payload.sub,
        email:    payload.email,
        name:     payload.name || payload.preferred_username,
        role, roles,
        source:   "keycloak",
      };
      return next();
    }
  } catch(e) {
    return res.status(401).json({ error: "Token Keycloak invalido", detail: e.message });
  }

  // Modo hibrido: tenta JWT local
  if (HYBRID_MODE) {
    try {
      const local = jwt.verify(token, process.env.JWT_SECRET);
      req.user = { ...local, source: "local" };
      return next();
    } catch(e) {
      return res.status(401).json({ error: "Token invalido ou expirado" });
    }
  }

  return res.status(401).json({ error: "Token invalido" });
};

module.exports.requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Nao autenticado" });
  const userRoles = req.user.roles || [req.user.role];
  if (!allowedRoles.some(r => userRoles.includes(r))) {
    return res.status(403).json({ error: "Acesso negado", required: allowedRoles });
  }
  next();
};
