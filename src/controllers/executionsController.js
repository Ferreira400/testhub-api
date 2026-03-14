const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// GET /executions?cycle_id=&user_id=&squad_id=&status=
exports.list = async (req, res) => {
  const { cycle_id, user_id, squad_id, status } = req.query;
  let sql = `
    SELECT e.*, tc.code, tc.title, tc.priority,
      u.name AS executed_by_name, s.name AS squad_name
    FROM test_executions e
    JOIN test_cases tc ON tc.id = e.test_case_id
    JOIN users u ON u.id = e.executed_by
    JOIN squads s ON s.id = e.squad_id
    WHERE 1=1
  `;
  const params = [];
  if (cycle_id)  { sql += ' AND e.cycle_id = ?';    params.push(cycle_id); }
  if (user_id)   { sql += ' AND e.executed_by = ?'; params.push(user_id); }
  if (squad_id)  { sql += ' AND e.squad_id = ?';    params.push(squad_id); }
  if (status)    { sql += ' AND e.status = ?';      params.push(status); }
  sql += ' ORDER BY e.created_at DESC';

  const [rows] = await db.query(sql, params);
  res.json(rows);
};

// GET /executions/:id
exports.getById = async (req, res) => {
  const [exec] = await db.query(
    `SELECT e.*, tc.code, tc.title, u.name AS executed_by_name
     FROM test_executions e
     JOIN test_cases tc ON tc.id = e.test_case_id
     JOIN users u ON u.id = e.executed_by
     WHERE e.id = ?`, [req.params.id]
  );
  if (!exec.length) return res.status(404).json({ error: 'Execução não encontrada' });

  const [stepResults] = await db.query(
    `SELECT esr.*, ts.action, ts.expected_result, ts.step_order
     FROM execution_step_results esr
     JOIN test_steps ts ON ts.id = esr.step_id
     WHERE esr.execution_id = ? ORDER BY ts.step_order`,
    [req.params.id]
  );

  const [attachments] = await db.query(
    'SELECT * FROM execution_attachments WHERE execution_id = ?',
    [req.params.id]
  );

  res.json({ ...exec[0], step_results: stepResults, attachments });
};

// POST /executions
exports.create = async (req, res) => {
  const {
    cycle_id, test_case_id, squad_id, status,
    execution_type = 'manual', environment, duration_seconds,
    comments, step_results = []
  } = req.body;

  if (!cycle_id || !test_case_id || !squad_id || !status)
    return res.status(400).json({ error: 'cycle_id, test_case_id, squad_id e status são obrigatórios' });

  const id = uuidv4();
  await db.query(
    `INSERT INTO test_executions
     (id, cycle_id, test_case_id, executed_by, squad_id, status, execution_type,
      environment, duration_seconds, comments, started_at, finished_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
    [id, cycle_id, test_case_id, req.user.id, squad_id, status,
     execution_type, environment || null, duration_seconds || null, comments || null]
  );

  // Step results
  if (step_results.length) {
    const vals = step_results.map(sr => [uuidv4(), id, sr.step_id, sr.status, sr.actual_result || null, sr.comments || null]);
    await db.query(
      'INSERT INTO execution_step_results (id, execution_id, step_id, status, actual_result, comments) VALUES ?',
      [vals]
    );
  }

  res.status(201).json({ message: 'Execução registrada', id });
};

// PUT /executions/:id
exports.update = async (req, res) => {
  const { status, comments, duration_seconds } = req.body;
  await db.query(
    'UPDATE test_executions SET status=IFNULL(?,status), comments=IFNULL(?,comments), duration_seconds=IFNULL(?,duration_seconds), finished_at=NOW() WHERE id=?',
    [status, comments, duration_seconds, req.params.id]
  );
  res.json({ message: 'Execução atualizada' });
};
