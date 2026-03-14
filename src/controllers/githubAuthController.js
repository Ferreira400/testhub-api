/**
 * src/controllers/githubAuthController.js
 * 
 * Fluxo de autenticação GitHub Device Flow para obter token Copilot
 * 
 * Adicionar no routes/index.js:
 *   const ghAuth = require('../controllers/githubAuthController');
 *   router.get('/jira/github-auth',          ghAuth.startAuth);
 *   router.get('/jira/github-auth/status',   ghAuth.checkStatus);
 */

const { getDeviceCode, pollDeviceToken, setOAuthToken } = require('../services/gherkinService');

let authState = { pending: false, userCode: null, verificationUrl: null, done: false, error: null };

async function startAuth(req, res) {
  try {
    const device = await getDeviceCode();
    authState = {
      pending:         true,
      userCode:        device.user_code,
      verificationUrl: device.verification_uri,
      done:            false,
      error:           null,
    };

    // Inicia polling em background
    pollDeviceToken(device.device_code, device.interval || 5)
      .then(token => {
        setOAuthToken(token);
        authState.done    = true;
        authState.pending = false;
        console.log('[GITHUB] OAuth token obtido com sucesso!');
      })
      .catch(err => {
        authState.error   = err.message;
        authState.pending = false;
        console.error('[GITHUB] Erro OAuth:', err.message);
      });

    res.json({
      message:          'Acesse a URL abaixo e insira o código para autorizar o TestHub',
      user_code:        device.user_code,
      verification_url: device.verification_uri,
      expires_in:       device.expires_in,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function checkStatus(req, res) {
  res.json(authState);
}

module.exports = { startAuth, checkStatus };
