const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

exports.list = async (req, res) => {
  try {
    const { project_id, squad_id } = req.query;
    let sql = `SELECT tp.*, s.name AS squad_name, u.name AS owner_name
               FROM test_plans tp
               LEFT JOIN squads s ON s.id = tp.squad_id
               LEFT JOIN users u ON u.id = tp.owner_id
               WHERE 1=1`;
    const params = [];
    if (project_id) { sql += ' AND tp.project_id = ?'; params.push(project_id); }
    if (squad_id)   { sql += ' AND tp.squad_id = ?';   params.push(squad_id); }
    sql += ' ORDER BY tp.created_at DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT tp.*, s.name AS squad_name FROM test_plans tp
       LEFT JOIN squads s ON s.id = tp.squad_id WHERE tp.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Plano nao encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { project_id, squad_id, name, description, start_date, end_date, version_target } = req.body;
    if (!project_id || !squad_id || !name)
      return res.status(400).json({ error: 'project_id, squad_id e name sao obrigatorios' });

    const id = uuidv4();
    await db.query(
      `INSERT INTO test_plans (id, project_id, squad_id, name, description, start_date, end_date, version_target, owner_id, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, project_id, squad_id, name, description || null,
       start_date || null, end_date || null, version_target || null,
       req.user.id, req.user.id]
    );
    res.status(201).json({ message: 'Plano criado', id });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const { name, description, status, start_date, end_date } = req.body;
    await db.query(
      `UPDATE test_plans SET name=IFNULL(?,name), description=IFNULL(?,description),
       status=IFNULL(?,status), start_date=IFNULL(?,start_date), end_date=IFNULL(?,end_date)
       WHERE id=?`,
      [name, description, status, start_date, end_date, req.params.id]
    );
    res.json({ message: 'Plano atualizado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};