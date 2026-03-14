const db = require('../config/db');

exports.list = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY name'
  );
  res.json(rows);
};

exports.getById = async (req, res) => {
  const [rows] = await db.query(
    'SELECT id, name, email, role, avatar_url, is_active, last_login_at, created_at FROM users WHERE id = ?',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(rows[0]);
};

exports.update = async (req, res) => {
  const { name, role, avatar_url, is_active } = req.body;
  await db.query(
    'UPDATE users SET name=IFNULL(?,name), role=IFNULL(?,role), avatar_url=IFNULL(?,avatar_url), is_active=IFNULL(?,is_active) WHERE id=?',
    [name, role, avatar_url, is_active, req.params.id]
  );
  res.json({ message: 'Usuário atualizado' });
};

exports.remove = async (req, res) => {
  await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [req.params.id]);
  res.json({ message: 'Usuário desativado' });
};