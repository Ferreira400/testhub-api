const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Gera código sequencial ex: QA-TC-001
async function generateCode(projectId) {
  const [proj] = await db.query('SELECT `key` FROM projects WHERE id = ?', [projectId]);
  const prefix = proj[0]?.key || 'TC';
  const [count] = await db.query('SELECT COUNT(*) AS total FROM test_cases WHERE project_id = ?', [projectId]);
  const seq = String(count[0].total + 1).padStart(3, '0');
  return `${prefix}-TC-${seq}`;
}

// GET /test-cases?project_id=&suite_id=&type=&status=&priority=
exports.list = async (req, res) => {
  const { project_id, suite_id, type, status, priority } = req.query;
  let sql = `
    SELECT tc.*, ts.name AS suite_name, u.name AS assigned_to_name
    FROM test_cases tc
    LEFT JOIN test_suites ts ON ts.id = tc.suite_id
    LEFT JOIN users u ON u.id = tc.assigned_to
    WHERE 1=1
  `;
  const params = [];
  if (project_id) { sql += ' AND tc.project_id = ?'; params.push(project_id); }
  if (suite_id)   { sql += ' AND tc.suite_id = ?';   params.push(suite_id); }
  if (type)       { sql += ' AND tc.type = ?';        params.push(type); }
  if (status)     { sql += ' AND tc.status = ?';      params.push(status); }
  if (priority)   { sql += ' AND tc.priority = ?';    params.push(priority); }
  sql += ' ORDER BY tc.created_at DESC';

  const [rows] = await db.query(sql, params);
  res.json(rows);
};

// GET /test-cases/:id
exports.getById = async (req, res) => {
  const [tc] = await db.query(
    `SELECT tc.*, ts.name AS suite_name, u.name AS assigned_to_name
     FROM test_cases tc
     LEFT JOIN test_suites ts ON ts.id = tc.suite_id
     LEFT JOIN users u ON u.id = tc.assigned_to
     WHERE tc.id = ?`, [req.params.id]
  );
  if (!tc.length) return res.status(404).json({ error: 'Caso de teste não encontrado' });

  const [steps] = await db.query(
    'SELECT * FROM test_steps WHERE test_case_id = ? ORDER BY step_order',
    [req.params.id]
  );

  res.json({ ...tc[0], steps });
};

// POST /test-cases
exports.create = async (req, res) => {
  const {
    project_id, suite_id, title, description, preconditions, postconditions,
    type = 'manual', priority = 'medium', estimated_duration_min,
    assigned_to, steps = []
  } = req.body;

  if (!project_id || !title || !type)
    return res.status(400).json({ error: 'project_id, title e type são obrigatórios' });

  const id   = uuidv4();
  const code = await generateCode(project_id);

  await db.query(
    `INSERT INTO test_cases
     (id, project_id, suite_id, code, title, description, preconditions, postconditions,
      type, priority, estimated_duration_min, assigned_to, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, project_id, suite_id || null, code, title, description || null,
     preconditions || null, postconditions || null, type, priority,
     estimated_duration_min || null, assigned_to || null, req.user.id]
  );

  // Insere steps
  if (steps.length) {
    const stepValues = steps.map((s, i) => [uuidv4(), id, i + 1, s.action, s.expected_result, s.test_data || null]);
    await db.query(
      'INSERT INTO test_steps (id, test_case_id, step_order, action, expected_result, test_data) VALUES ?',
      [stepValues]
    );
  }

  res.status(201).json({ message: 'Caso de teste criado', id, code });
};

// PUT /test-cases/:id
exports.update = async (req, res) => {
  const {
    title, description, preconditions, postconditions,
    type, priority, status, automation_status,
    estimated_duration_min, assigned_to, steps
  } = req.body;

  await db.query(
    `UPDATE test_cases SET
      title=IFNULL(?,title), description=IFNULL(?,description),
      preconditions=IFNULL(?,preconditions), postconditions=IFNULL(?,postconditions),
      type=IFNULL(?,type), priority=IFNULL(?,priority), status=IFNULL(?,status),
      automation_status=IFNULL(?,automation_status),
      estimated_duration_min=IFNULL(?,estimated_duration_min),
      assigned_to=IFNULL(?,assigned_to), version = version + 1
     WHERE id = ?`,
    [title, description, preconditions, postconditions, type, priority,
     status, automation_status, estimated_duration_min, assigned_to, req.params.id]
  );

  // Atualiza steps se enviados
  if (steps && steps.length) {
    await db.query('DELETE FROM test_steps WHERE test_case_id = ?', [req.params.id]);
    const stepValues = steps.map((s, i) => [uuidv4(), req.params.id, i + 1, s.action, s.expected_result, s.test_data || null]);
    await db.query(
      'INSERT INTO test_steps (id, test_case_id, step_order, action, expected_result, test_data) VALUES ?',
      [stepValues]
    );
  }

  res.json({ message: 'Caso de teste atualizado' });
};

// DELETE /test-cases/:id
exports.remove = async (req, res) => {
  await db.query('UPDATE test_cases SET status = "deprecated" WHERE id = ?', [req.params.id]);
  res.json({ message: 'Caso de teste removido' });
};
