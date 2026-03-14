const db   = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// POST /auth/register
exports.register = async (req, res) => {
  const { name, email, password, role = 'qa_engineer' } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email e password são obrigatórios' });

  const [exists] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
  if (exists.length) return res.status(409).json({ error: 'Email já cadastrado' });

  const hash = await bcrypt.hash(password, 10);
  const id   = uuidv4();
  await db.query(
    'INSERT INTO users (id, name, email, password_hash, role) VALUES (?,?,?,?,?)',
    [id, name, email, hash, role]
  );

  res.status(201).json({ message: 'Usuário criado com sucesso', id });
};

// POST /auth/login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'email e password são obrigatórios' });

  const [rows] = await db.query('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
  if (!rows.length) return res.status(401).json({ error: 'Credenciais inválidas' });

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciais inválidas' });

  await db.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
};

// GET /auth/me
exports.me = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, name, email, role, avatar_url, created_at FROM users WHERE id = ?',
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(rows[0]);
};
