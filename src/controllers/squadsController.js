const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

exports.list = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page || 1);
    const limit = Math.min(parseInt(req.query.limit || 20), 100);
    const offset = (page - 1) * limit;

    const [rows] = await db.query(`
      SELECT s.*, u.name AS created_by_name,
        COUNT(DISTINCT sm.user_id) AS member_count
      FROM squads s
      LEFT JOIN users u ON u.id = s.created_by
      LEFT JOIN squad_members sm ON sm.squad_id = s.id
      GROUP BY s.id ORDER BY s.name
      LIMIT ? OFFSET ?
    `, [limit, offset]);

    const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM squads');

    res.json({ data: rows, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

exports.getById = async (req, res, next) => {
  try {
    const [squad] = await db.query('SELECT * FROM squads WHERE id = ?', [req.params.id]);
    if (!squad.length) return res.status(404).json({ error: 'Squad não encontrada' });

    const [members] = await db.query(`
      SELECT u.id, u.name, u.email, u.role, sm.squad_role, sm.joined_at
      FROM squad_members sm JOIN users u ON u.id = sm.user_id
      WHERE sm.squad_id = ?`, [req.params.id]);

    res.json({ ...squad[0], members });
  } catch (err) {
    next(err);
  }
};

exports.create = async (req, res, next) => {
  try {
    const { name, description, color_hex, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'name é obrigatório' });

    const id = uuidv4();
    await db.query(
      'INSERT INTO squads (id, name, description, color_hex, icon, created_by) VALUES (?,?,?,?,?,?)',
      [id, name, description || null, color_hex || '#6366F1', icon || null, req.user.id]
    );

    res.status(201).json({ message: 'Squad criada', id });
  } catch (err) {
    next(err);
  }
};

exports.update = async (req, res, next) => {
  try {
    const { name, description, color_hex, icon } = req.body;

    const [existing] = await db.query('SELECT id FROM squads WHERE id = ?', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ error: 'Squad não encontrada' });
    }

    await db.query(
      'UPDATE squads SET name = IFNULL(?, name), description = IFNULL(?, description), color_hex = IFNULL(?, color_hex), icon = IFNULL(?, icon) WHERE id = ?',
      [name, description, color_hex, icon, req.params.id]
    );

    res.json({ message: 'Squad atualizada' });
  } catch (err) {
    next(err);
  }
};

exports.remove = async (req, res, next) => {
  try {
    const [existing] = await db.query('SELECT id FROM squads WHERE id = ?', [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ error: 'Squad não encontrada' });
    }

    await db.query('DELETE FROM squads WHERE id = ?', [req.params.id]);
    res.json({ message: 'Squad removida' });
  } catch (err) {
    next(err);
  }
};

exports.addMember = async (req, res, next) => {
  try {
    const { user_id, squad_role = 'member' } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id é obrigatório' });

    const [squad] = await db.query('SELECT id FROM squads WHERE id = ?', [req.params.id]);
    if (!squad.length) return res.status(404).json({ error: 'Squad não encontrada: ' + req.params.id });

    const [user] = await db.query('SELECT id FROM users WHERE id = ?', [user_id]);
    if (!user.length) return res.status(404).json({ error: 'Usuário não encontrado: ' + user_id });

    const id = uuidv4();
    await db.query(
      'INSERT INTO squad_members (id, squad_id, user_id, squad_role) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE squad_role=VALUES(squad_role)',
      [id, req.params.id, user_id, squad_role]
    );

    res.status(201).json({ message: 'Membro adicionado' });
  } catch (err) {
    next(err);
  }
};

exports.removeMember = async (req, res, next) => {
  try {
    await db.query(
      'DELETE FROM squad_members WHERE squad_id = ? AND user_id = ?',
      [req.params.id, req.params.userId]
    );
    res.json({ message: 'Membro removido' });
  } catch (err) {
    next(err);
  }
};