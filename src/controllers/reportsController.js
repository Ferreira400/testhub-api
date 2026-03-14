const db = require('../config/db');

// GET /reports/dashboard?project_id=&squad_id=
exports.dashboard = async (req, res) => {
  const { project_id, squad_id } = req.query;
  const params = [];
  let filter = 'WHERE 1=1';
  if (project_id) { filter += ' AND e.cycle_id IN (SELECT tc.id FROM test_cycles tc JOIN test_plans tp ON tp.id = tc.plan_id WHERE tp.project_id = ?)'; params.push(project_id); }
  if (squad_id)   { filter += ' AND e.squad_id = ?'; params.push(squad_id); }

  // Total por status
  const [statusSummary] = await db.query(`
    SELECT status, COUNT(*) AS total
    FROM test_executions e ${filter}
    GROUP BY status
  `, params);

  // Execuções por usuário
  const [byUser] = await db.query(`
    SELECT u.name, u.id,
      COUNT(*) AS total,
      SUM(e.status = 'passed') AS passed,
      SUM(e.status = 'failed') AS failed,
      SUM(e.status = 'blocked') AS blocked
    FROM test_executions e
    JOIN users u ON u.id = e.executed_by
    ${filter}
    GROUP BY e.executed_by ORDER BY total DESC
  `, params);

  // Execuções por squad
  const [bySquad] = await db.query(`
    SELECT s.name AS squad, s.color_hex,
      COUNT(*) AS total,
      SUM(e.status = 'passed') AS passed,
      SUM(e.status = 'failed') AS failed,
      ROUND(SUM(e.status = 'passed') / COUNT(*) * 100, 1) AS pass_rate
    FROM test_executions e
    JOIN squads s ON s.id = e.squad_id
    ${filter}
    GROUP BY e.squad_id ORDER BY total DESC
  `, params);

  // Tendência últimos 30 dias
  const [trend] = await db.query(`
    SELECT DATE(e.created_at) AS date,
      COUNT(*) AS total,
      SUM(e.status = 'passed') AS passed,
      SUM(e.status = 'failed') AS failed
    FROM test_executions e
    ${filter} AND e.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY DATE(e.created_at)
    ORDER BY date ASC
  `, params);

  // Cobertura de automação
  const [coverage] = await db.query(`
    SELECT
      COUNT(*) AS total,
      SUM(automation_status = 'automated') AS automated,
      ROUND(SUM(automation_status = 'automated') / COUNT(*) * 100, 1) AS coverage_pct
    FROM test_cases
    ${project_id ? 'WHERE project_id = ?' : ''}
  `, project_id ? [project_id] : []);

  res.json({
    status_summary: statusSummary,
    by_user: byUser,
    by_squad: bySquad,
    trend_30_days: trend,
    automation_coverage: coverage[0]
  });
};

// GET /reports/cycle/:cycleId
exports.byCycle = async (req, res) => {
  const { cycleId } = req.params;

  const [summary] = await db.query(`
    SELECT
      COUNT(*) AS total,
      SUM(status = 'passed')      AS passed,
      SUM(status = 'failed')      AS failed,
      SUM(status = 'blocked')     AS blocked,
      SUM(status = 'skipped')     AS skipped,
      SUM(status = 'not_run')     AS not_run,
      SUM(status = 'in_progress') AS in_progress,
      ROUND(SUM(status = 'passed') / COUNT(*) * 100, 1) AS pass_rate,
      ROUND(AVG(duration_seconds), 0) AS avg_duration_seconds
    FROM test_executions WHERE cycle_id = ?
  `, [cycleId]);

  const [byUser] = await db.query(`
    SELECT u.name, u.id,
      COUNT(*) AS total,
      SUM(e.status = 'passed') AS passed,
      SUM(e.status = 'failed') AS failed
    FROM test_executions e
    JOIN users u ON u.id = e.executed_by
    WHERE e.cycle_id = ?
    GROUP BY e.executed_by
  `, [cycleId]);

  const [failures] = await db.query(`
    SELECT e.id, tc.code, tc.title, tc.priority, e.comments,
      u.name AS executed_by, e.created_at
    FROM test_executions e
    JOIN test_cases tc ON tc.id = e.test_case_id
    JOIN users u ON u.id = e.executed_by
    WHERE e.cycle_id = ? AND e.status = 'failed'
    ORDER BY tc.priority DESC
  `, [cycleId]);

  res.json({ summary: summary[0], by_user: byUser, failures });
};

// GET /reports/squad/:squadId
exports.bySquad = async (req, res) => {
  const { squadId } = req.params;
  const { days = 30 } = req.query;

  const [members] = await db.query(`
    SELECT u.id, u.name, u.email,
      COUNT(e.id) AS total_executions,
      SUM(e.status = 'passed') AS passed,
      SUM(e.status = 'failed') AS failed,
      ROUND(SUM(e.status = 'passed') / NULLIF(COUNT(e.id),0) * 100, 1) AS pass_rate
    FROM squad_members sm
    JOIN users u ON u.id = sm.user_id
    LEFT JOIN test_executions e ON e.executed_by = u.id AND e.squad_id = ?
      AND e.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
    WHERE sm.squad_id = ?
    GROUP BY u.id ORDER BY total_executions DESC
  `, [squadId, Number(days), squadId]);

  res.json({ squad_id: squadId, period_days: days, members });
};
