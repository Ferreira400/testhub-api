const db = require('../config/db');

exports.list = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page || 1);
    const limit = Math.min(parseInt(req.query.limit || 20), 100);
    const offset = (page - 1) * limit;

    const [rows] = await db.query(
      'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY name LIMIT ? OFFSET ?',
      [limit, offset]
    );

    const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM users');

    res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const [rows] = await db.query(
      'SELECT id, name, email, role, avatar_url, is_active, last_login_at, created_at FROM users WHERE id = ?',
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { name, role, avatar_url, is_active } = req.body;

    const [existing] = await db.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    await db.query(
      'UPDATE users SET name = IFNULL(?, name), role = IFNULL(?, role), avatar_url = IFNULL(?, avatar_url), is_active = IFNULL(?, is_active) WHERE id = ?',
      [name, role, avatar_url, is_active, req.params.id]
    );

    res.json({ message: 'Usuário atualizado' });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const [existing] = await db.query('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    await db.query('UPDATE users SET is_active = 0 WHERE id = ?', [req.params.id]);
    res.json({ message: 'Usuário desativado' });
  } catch (err) {
    next(err);
  }
};