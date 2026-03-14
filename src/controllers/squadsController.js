const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

exports.list = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT s.*, u.name AS created_by_name,
        COUNT(DISTINCT sm.user_id) AS member_count
      FROM squads s
      LEFT JOIN users u ON u.id = s.created_by
      LEFT JOIN squad_members sm ON sm.squad_id = s.id
      GROUP BY s.id ORDER BY s.name
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getById = async (req, res) => {
  try {
    const [squad] = await db.query('SELECT * FROM squads WHERE id = ?', [req.params.id]);
    if (!squad.length) return res.status(404).json({ error: 'Squad nao encontrada' });
    const [members] = await db.query(`
      SELECT u.id, u.name, u.email, u.role, sm.squad_role, sm.joined_at
      FROM squad_members sm JOIN users u ON u.id = sm.user_id
      WHERE sm.squad_id = ?`, [req.params.id]);
    res.json({ ...squad[0], members });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { name, description, color_hex, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'name e obrigatorio' });
    const id = uuidv4();
    await db.query(
      'INSERT INTO squads (id, name, description, color_hex, icon, created_by) VALUES (?,?,?,?,?,?)',
      [id, name, description || null, color_hex || '#6366F1', icon || null, req.user.id]
    );
    res.status(201).json({ message: 'Squad criada', id });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const { name, description, color_hex, icon } = req.body;
    await db.query(
      'UPDATE squads SET name=IFNULL(?,name), description=IFNULL(?,description), color_hex=IFNULL(?,color_hex), icon=IFNULL(?,icon) WHERE id=?',
      [name, description, color_hex, icon, req.params.id]
    );
    res.json({ message: 'Squad atualizada' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.remove = async (req, res) => {
  try {
    await db.query('DELETE FROM squads WHERE id = ?', [req.params.id]);
    res.json({ message: 'Squad removida' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.addMember = async (req, res) => {
  try {
    const { user_id, squad_role = 'member' } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id e obrigatorio' });

    // Valida se squad existe
    const [squad] = await db.query('SELECT id FROM squads WHERE id = ?', [req.params.id]);
    if (!squad.length) return res.status(404).json({ error: 'Squad nao encontrada: ' + req.params.id });

    // Valida se user existe
    const [user] = await db.query('SELECT id FROM users WHERE id = ?', [user_id]);
    if (!user.length) return res.status(404).json({ error: 'Usuario nao encontrado: ' + user_id });

    const id = uuidv4();
    await db.query(
      'INSERT INTO squad_members (id, squad_id, user_id, squad_role) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE squad_role=VALUES(squad_role)',
      [id, req.params.id, user_id, squad_role]
    );
    res.status(201).json({ message: 'Membro adicionado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.removeMember = async (req, res) => {
  try {
    await db.query(
      'DELETE FROM squad_members WHERE squad_id = ? AND user_id = ?',
      [req.params.id, req.params.userId]
    );
    res.json({ message: 'Membro removido' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};