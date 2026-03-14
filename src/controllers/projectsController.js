const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

exports.list = async (req, res) => {
  const { squad_id } = req.query;
  let sql = `
    SELECT p.*, s.name AS squad_name, u.name AS created_by_name,
      COUNT(DISTINCT tc.id) AS total_cases
    FROM projects p
    LEFT JOIN squads s ON s.id = p.squad_id
    LEFT JOIN users u ON u.id = p.created_by
    LEFT JOIN test_cases tc ON tc.project_id = p.id
  `;
  const params = [];
  if (squad_id) { sql += ' WHERE p.squad_id = ?'; params.push(squad_id); }
  sql += ' GROUP BY p.id ORDER BY p.name';
  const [rows] = await db.query(sql, params);
  res.json(rows);
};

exports.getById = async (req, res) => {
  const [rows] = await db.query(
    'SELECT p.*, s.name AS squad_name FROM projects p LEFT JOIN squads s ON s.id = p.squad_id WHERE p.id = ?',
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Projeto não encontrado' });
  res.json(rows[0]);
};

exports.create = async (req, res) => {
  const { squad_id, name, key, description, repository_url, jira_project_key } = req.body;
  if (!squad_id || !name || !key)
    return res.status(400).json({ error: 'squad_id, name e key são obrigatórios' });
  const id = uuidv4();
  await db.query(
    'INSERT INTO projects (id, squad_id, name, `key`, description, repository_url, jira_project_key, created_by) VALUES (?,?,?,?,?,?,?,?)',
    [id, squad_id, name, key.toUpperCase(), description || null, repository_url || null, jira_project_key || null, req.user.id]
  );
  res.status(201).json({ message: 'Projeto criado', id });
};

exports.update = async (req, res) => {
  const { name, description, status, repository_url } = req.body;
  await db.query(
    'UPDATE projects SET name=IFNULL(?,name), description=IFNULL(?,description), status=IFNULL(?,status), repository_url=IFNULL(?,repository_url) WHERE id=?',
    [name, description, status, repository_url, req.params.id]
  );
  res.json({ message: 'Projeto atualizado' });
};

exports.remove = async (req, res) => {
  await db.query('UPDATE projects SET status = "archived" WHERE id = ?', [req.params.id]);
  res.json({ message: 'Projeto arquivado' });
};