const db   = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// POST /auth/register
// VALIDACAO: name, email, password já validados em routes/validators.js
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role = 'qa_engineer' } = req.body;

    // Verifica duplicidade (validador apenas testa format, aqui testa unicidade)
    const [exists] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (exists.length) {
      return res.status(409).json({ error: 'Email já cadastrado' });
    }

    // Hash da senha
    const hash = await bcrypt.hash(password, 10);
    const id   = uuidv4();

    // Insere novo usuário
    await db.query(
      'INSERT INTO users (id, name, email, password_hash, role, is_active) VALUES (?,?,?,?,?,1)',
      [id, name, email, hash, role]
    );

    res.status(201).json({
      message: 'Usuário criado com sucesso',
      id,
      email
    });

  } catch (err) {
    // MySQL ER_DUP_ENTRY será tratado pelo error handler global
    next(err);
  }
};

// POST /auth/login
// VALIDACAO: email, password já validados em routes/validators.js
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Busca usuário ativo
    const [rows] = await db.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = ? AND is_active = 1',
      [email]
    );

    // Usuário não existe ou inativo
    if (!rows.length) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = rows[0];

    // Compara senhas
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Atualiza último login (async, não aguarda)
    db.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id])
      .catch(err => console.warn('[WARN] Erro ao atualizar last_login_at:', err.message));

    // Gera token JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        source: 'local'
      }
    });

  } catch (err) {
    next(err);
  }
};

// GET /auth/me
// Retorna dados do usuário autenticado
exports.me = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const [rows] = await db.query(
      'SELECT id, name, email, role, avatar_url, created_at FROM users WHERE id = ? AND is_active = 1',
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json(rows[0]);

  } catch (err) {
    next(err);
  }
};
