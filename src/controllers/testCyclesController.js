const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

exports.list = async (req, res) => {
  try {
    const { plan_id } = req.query;
    let sql = `SELECT tc.*, u.name AS assigned_to_name
               FROM test_cycles tc LEFT JOIN users u ON u.id = tc.assigned_to WHERE 1=1`;
    const params = [];
    if (plan_id) { sql += ' AND tc.plan_id = ?'; params.push(plan_id); }
    sql += ' ORDER BY tc.created_at DESC';
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getById = async (req, res) => {
  try {
    const [cycle] = await db.query(
      `SELECT tc.*, u.name AS assigned_to_name FROM test_cycles tc
       LEFT JOIN users u ON u.id = tc.assigned_to WHERE tc.id = ?`,
      [req.params.id]
    );
    if (!cycle.length) return res.status(404).json({ error: 'Ciclo nao encontrado' });
    const [cases] = await db.query(`
      SELECT tcc.*, t.code, t.title, t.priority, t.type, u.name AS assigned_to_name
      FROM test_cycle_cases tcc
      JOIN test_cases t ON t.id = tcc.test_case_id
      LEFT JOIN users u ON u.id = tcc.assigned_to
      WHERE tcc.cycle_id = ? ORDER BY tcc.order_index
    `, [req.params.id]);
    res.json({ ...cycle[0], cases });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const {
      plan_id, project_id, squad_id,
      name, description, environment,
      build_version, start_date, end_date,
      assigned_to, case_ids = []
    } = req.body;

    if (!name) return res.status(400).json({ error: 'name e obrigatorio' });

    let resolvedPlanId = plan_id;

    // Se nao tem plan_id mas tem project_id e squad_id, cria um plano automaticamente
    if (!resolvedPlanId) {
      if (!project_id || !squad_id)
        return res.status(400).json({
          error: 'Informe plan_id existente OU project_id + squad_id para criar o plano automaticamente'
        });

      resolvedPlanId = uuidv4();
      await db.query(
        `INSERT INTO test_plans (id, project_id, squad_id, name, description, owner_id, created_by)
         VALUES (?,?,?,?,?,?,?)`,
        [resolvedPlanId, project_id, squad_id,
         'Plano - ' + name, description || null,
         req.user.id, req.user.id]
      );
    } else {
      // Valida se plan_id existe
      const [plan] = await db.query('SELECT id FROM test_plans WHERE id = ?', [resolvedPlanId]);
      if (!plan.length)
        return res.status(400).json({
          error: 'plan_id nao encontrado. Use project_id + squad_id para criar automaticamente.'
        });
    }

    const id = uuidv4();
    await db.query(
      `INSERT INTO test_cycles
       (id, plan_id, name, description, environment, build_version, start_date, end_date, assigned_to, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [id, resolvedPlanId, name, description || null, environment || null,
       build_version || null, start_date || null, end_date || null,
       assigned_to || null, req.user.id]
    );

    if (case_ids.length) {
      const vals = case_ids.map((cid, i) => [uuidv4(), id, cid, assigned_to || null, i]);
      await db.query(
        'INSERT INTO test_cycle_cases (id, cycle_id, test_case_id, assigned_to, order_index) VALUES ?',
        [vals]
      );
    }

    res.status(201).json({ message: 'Ciclo criado', id, plan_id: resolvedPlanId });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const { name, description, status, environment, build_version, start_date, end_date } = req.body;
    await db.query(
      `UPDATE test_cycles SET
       name=IFNULL(?,name), description=IFNULL(?,description),
       status=IFNULL(?,status), environment=IFNULL(?,environment),
       build_version=IFNULL(?,build_version),
       start_date=IFNULL(?,start_date), end_date=IFNULL(?,end_date)
       WHERE id=?`,
      [name, description, status, environment, build_version, start_date, end_date, req.params.id]
    );
    res.json({ message: 'Ciclo atualizado' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};