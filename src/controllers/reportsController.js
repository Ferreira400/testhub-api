const db = require('../config/db');

// GET /reports/dashboard?project_id=&squad_id=
exports.dashboard = async (req, res) => {
  const { project_id, squad_id } = req.query;
  const params = [];
  let filter = 'WHERE 1=1';
  if (project_id) {
    filter += ' AND e.cycle_id IN (SELECT tc.id FROM test_cycles tc JOIN test_plans tp ON tp.id = tc.plan_id WHERE tp.project_id = ?)';
    params.push(project_id);
  }
  if (squad_id) { filter += ' AND e.squad_id = ?'; params.push(squad_id); }

  try {
    const [statusSummary] = await db.query(`
      SELECT status, COUNT(*) AS total FROM test_executions e ${filter} GROUP BY status
    `, params);

    const [byUser] = await db.query(`
      SELECT u.name, u.id,
        COUNT(*) AS total,
        SUM(e.status = 'passed') AS passed,
        SUM(e.status = 'failed') AS failed,
        SUM(e.status = 'blocked') AS blocked
      FROM test_executions e JOIN users u ON u.id = e.executed_by ${filter}
      GROUP BY e.executed_by ORDER BY total DESC
    `, params);

    const [bySquad] = await db.query(`
      SELECT s.name AS squad,
        COUNT(*) AS total,
        SUM(e.status = 'passed') AS passed,
        SUM(e.status = 'failed') AS failed,
        ROUND(SUM(e.status = 'passed') / COUNT(*) * 100, 1) AS pass_rate
      FROM test_executions e JOIN squads s ON s.id = e.squad_id ${filter}
      GROUP BY e.squad_id ORDER BY total DESC
    `, params);

    const [trend] = await db.query(`
      SELECT DATE(e.started_at) AS date,
        COUNT(*) AS total,
        SUM(e.status = 'passed') AS passed,
        SUM(e.status = 'failed') AS failed
      FROM test_executions e
      ${filter} AND e.started_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(e.started_at) ORDER BY date ASC
    `, params);

    const [coverage] = await db.query(`
      SELECT COUNT(*) AS total,
        SUM(automation_status = 'automated') AS automated,
        ROUND(SUM(automation_status = 'automated') / COUNT(*) * 100, 1) AS coverage_pct
      FROM test_cases ${project_id ? 'WHERE project_id = ?' : ''}
    `, project_id ? [project_id] : []);

    res.json({
      status_summary: statusSummary,
      by_user: byUser,
      by_squad: bySquad,
      trend_30_days: trend,
      automation_coverage: coverage[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /reports/cycle/:cycleId
exports.byCycle = async (req, res) => {
  const { cycleId } = req.params;
  try {
    const [summary] = await db.query(`
      SELECT
        COUNT(*) AS total,
        SUM(status = 'passed')      AS passed,
        SUM(status = 'failed')      AS failed,
        SUM(status = 'blocked')     AS blocked,
        SUM(status = 'skipped')     AS skipped,
        SUM(status = 'not_run')     AS not_run,
        SUM(status = 'in_progress') AS in_progress,
        ROUND(SUM(status = 'passed') / NULLIF(COUNT(*),0) * 100, 1) AS pass_rate,
        ROUND(AVG(duration_seconds), 0) AS avg_duration_seconds
      FROM test_executions WHERE cycle_id = ?
    `, [cycleId]);

    const [byUser] = await db.query(`
      SELECT u.name, COUNT(*) AS total,
        SUM(e.status = 'passed') AS passed,
        SUM(e.status = 'failed') AS failed
      FROM test_executions e JOIN users u ON u.id = e.executed_by
      WHERE e.cycle_id = ? GROUP BY e.executed_by
    `, [cycleId]);

    const [failures] = await db.query(`
      SELECT e.id, tc.code, tc.title, tc.priority, e.comments,
        u.name AS executed_by, e.started_at AS executed_at
      FROM test_executions e
      JOIN test_cases tc ON tc.id = e.test_case_id
      JOIN users u ON u.id = e.executed_by
      WHERE e.cycle_id = ? AND e.status = 'failed'
      ORDER BY tc.priority DESC
    `, [cycleId]);

    res.json({ summary: summary[0], by_user: byUser, failures });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /reports/squad/:squadId
exports.bySquad = async (req, res) => {
  const { squadId } = req.params;
  const { days = 30 } = req.query;
  try {
    const [members] = await db.query(`
      SELECT u.id, u.name, u.email,
        COUNT(e.id) AS total_executions,
        SUM(e.status = 'passed') AS passed,
        SUM(e.status = 'failed') AS failed,
        ROUND(SUM(e.status = 'passed') / NULLIF(COUNT(e.id),0) * 100, 1) AS pass_rate
      FROM squad_members sm
      JOIN users u ON u.id = sm.user_id
      LEFT JOIN test_executions e ON e.executed_by = u.id AND e.squad_id = ?
        AND e.started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
      WHERE sm.squad_id = ?
      GROUP BY u.id ORDER BY total_executions DESC
    `, [squadId, Number(days), squadId]);

    res.json({ squad_id: squadId, period_days: days, members });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /reports/bugs?project_id=&squad_id=&days=30
exports.bugs = async (req, res) => {
  const { project_id, squad_id, days = 30 } = req.query;
  const params = [Number(days)];
  let filter = 'WHERE e.status = "failed" AND e.started_at >= DATE_SUB(NOW(), INTERVAL ? DAY)';
  if (squad_id)   { filter += ' AND e.squad_id = ?';    params.push(squad_id); }
  if (project_id) { filter += ' AND e.cycle_id IN (SELECT tc.id FROM test_cycles tc JOIN test_plans tp ON tp.id = tc.plan_id WHERE tp.project_id = ?)'; params.push(project_id); }

  try {
    // Lista de falhas
    const [failures] = await db.query(`
      SELECT e.id, tc.code, tc.title, tc.priority, tc.jira_key,
        e.comments, e.duration_seconds,
        u.name AS executed_by, s.name AS squad_name,
        cy.name AS cycle_name,
        e.started_at AS executed_at
      FROM test_executions e
      JOIN test_cases tc ON tc.id = e.test_case_id
      JOIN users u ON u.id = e.executed_by
      JOIN squads s ON s.id = e.squad_id
      JOIN test_cycles cy ON cy.id = e.cycle_id
      ${filter}
      ORDER BY tc.priority DESC, e.started_at DESC
    `, params);

    // Casos com mais falhas
    const [topFailing] = await db.query(`
      SELECT tc.code, tc.title, tc.priority, tc.jira_key,
        COUNT(*) AS fail_count,
        MAX(e.started_at) AS last_failure
      FROM test_executions e
      JOIN test_cases tc ON tc.id = e.test_case_id
      ${filter}
      GROUP BY e.test_case_id ORDER BY fail_count DESC LIMIT 10
    `, params);

    // Falhas por prioridade
    const [byPriority] = await db.query(`
      SELECT tc.priority, COUNT(*) AS total
      FROM test_executions e
      JOIN test_cases tc ON tc.id = e.test_case_id
      ${filter}
      GROUP BY tc.priority ORDER BY FIELD(tc.priority,'critical','high','medium','low')
    `, params);

    // Evolução de falhas por dia
    const [trend] = await db.query(`
      SELECT DATE(e.started_at) AS date, COUNT(*) AS failures
      FROM test_executions e ${filter}
      GROUP BY DATE(e.started_at) ORDER BY date ASC
    `, params);

    res.json({ failures, top_failing: topFailing, by_priority: byPriority, trend });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /reports/execution-progress?project_id=&squad_id=
exports.executionProgress = async (req, res) => {
  const { project_id, squad_id } = req.query;
  try {
    let cycleFilter = 'WHERE 1=1';
    const cycleParams = [];
    if (project_id) { cycleFilter += ' AND tp.project_id = ?'; cycleParams.push(project_id); }

    const [cycles] = await db.query(`
      SELECT cy.id, cy.name, cy.status, cy.environment, cy.build_version,
        cy.created_at,
        COUNT(DISTINCT tcc.test_case_id) AS total_cases,
        COUNT(DISTINCT CASE WHEN e.status IS NOT NULL THEN e.test_case_id END) AS executed,
        COUNT(DISTINCT CASE WHEN e.status = 'passed' THEN e.test_case_id END) AS passed,
        COUNT(DISTINCT CASE WHEN e.status = 'failed' THEN e.test_case_id END) AS failed,
        COUNT(DISTINCT CASE WHEN e.status = 'blocked' THEN e.test_case_id END) AS blocked,
        ROUND(COUNT(DISTINCT CASE WHEN e.status IS NOT NULL THEN e.test_case_id END) / NULLIF(COUNT(DISTINCT tcc.test_case_id),0) * 100, 1) AS progress_pct,
        ROUND(COUNT(DISTINCT CASE WHEN e.status = 'passed' THEN e.test_case_id END) / NULLIF(COUNT(DISTINCT tcc.test_case_id),0) * 100, 1) AS pass_rate
      FROM test_cycles cy
      JOIN test_plans tp ON tp.id = cy.plan_id
      LEFT JOIN test_cycle_cases tcc ON tcc.cycle_id = cy.id
      LEFT JOIN test_executions e ON e.cycle_id = cy.id
        ${squad_id ? 'AND e.squad_id = ?' : ''}
      ${cycleFilter}
      GROUP BY cy.id ORDER BY cy.created_at DESC LIMIT 20
    `, squad_id ? [squad_id, ...cycleParams] : cycleParams);

    res.json({ cycles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /reports/bugs-by-sprint?squad_id=&project_id=
exports.bugsBySprint = async (req, res) => {
  const { squad_id, project_id } = req.query;
  try {
    const cycleFilter  = project_id ? 'AND tp.project_id = ?'        : '';
    const cycleParams  = project_id ? [project_id]                   : [];
    const squadFilter  = squad_id   ? 'AND bl.squad_id = ?'          : '';
    const squadParams  = squad_id   ? [squad_id]                     : [];

    const [byCycle] = await db.query(`
      SELECT
        cy.id AS cycle_id, cy.name AS cycle_name,
        cy.environment, cy.build_version, cy.created_at,
        COUNT(bl.id)                                                                      AS total_bugs,
        SUM(bl.status = 'open')                                                           AS open,
        SUM(bl.status = 'in_progress')                                                    AS in_progress,
        SUM(bl.status = 'resolved')                                                       AS resolved,
        SUM(bl.status = 'closed')                                                         AS closed,
        SUM(bl.status = 'retest_pending')                                                 AS retest_pending,
        ROUND(SUM(bl.status IN ('resolved','closed')) / NULLIF(COUNT(bl.id),0) * 100, 1) AS resolution_rate,
        ROUND(AVG(TIMESTAMPDIFF(HOUR, bl.created_at, bl.resolved_at)), 1)                AS avg_resolution_hours
      FROM bug_links bl
      JOIN test_cycles cy ON cy.id = bl.cycle_id
      JOIN test_plans tp  ON tp.id = cy.plan_id
      WHERE 1=1 ${cycleFilter} ${squadFilter}
      GROUP BY cy.id ORDER BY cy.created_at DESC LIMIT 20
    `, [...cycleParams, ...squadParams]);

    const [criticalOpen] = await db.query(`
      SELECT bl.jira_bug_key, bl.status, bl.created_at,
        tc.code AS case_code, tc.title AS case_title, tc.priority,
        cy.name AS cycle_name, s.name AS squad_name,
        TIMESTAMPDIFF(HOUR, bl.created_at, NOW()) AS age_hours
      FROM bug_links bl
      JOIN test_cases tc  ON tc.id = bl.test_case_id
      JOIN test_cycles cy ON cy.id = bl.cycle_id
      JOIN squads s       ON s.id  = bl.squad_id
      WHERE bl.status IN ('open','in_progress')
        AND tc.priority IN ('critical','high')
        ${squad_id ? 'AND bl.squad_id = ?' : ''}
      ORDER BY tc.priority DESC, bl.created_at ASC LIMIT 20
    `, squadParams);

    const [trend] = await db.query(`
      SELECT DATE(bl.created_at) AS date, COUNT(*) AS opened
      FROM bug_links bl
      WHERE bl.created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)
        ${squadFilter}
      GROUP BY DATE(bl.created_at) ORDER BY date ASC
    `, squadParams);

    const [global] = await db.query(`
      SELECT
        COUNT(*)                                                              AS total,
        SUM(bl.status IN ('open','in_progress'))                             AS open,
        SUM(bl.status IN ('resolved','closed'))                              AS resolved,
        SUM(bl.status = 'retest_pending')                                    AS retest_pending,
        ROUND(SUM(bl.status IN ('resolved','closed'))/NULLIF(COUNT(*),0)*100,1) AS resolution_rate,
        ROUND(AVG(TIMESTAMPDIFF(HOUR, bl.created_at, bl.resolved_at)),1)    AS avg_resolution_hours,
        SUM(tc.priority = 'critical' AND bl.status IN ('open','in_progress')) AS critical_open,
        SUM(tc.priority = 'high'     AND bl.status IN ('open','in_progress')) AS high_open
      FROM bug_links bl
      JOIN test_cases tc ON tc.id = bl.test_case_id
      WHERE 1=1 ${squadFilter}
    `, squadParams);

    const [topCases] = await db.query(`
      SELECT tc.code, tc.title, tc.priority, tc.jira_key,
        COUNT(bl.id)                             AS bug_count,
        SUM(bl.status IN ('open','in_progress')) AS open_count,
        MAX(bl.created_at)                       AS last_bug,
        GROUP_CONCAT(DISTINCT bl.jira_bug_key ORDER BY bl.created_at DESC SEPARATOR ',') AS bug_keys
      FROM bug_links bl
      JOIN test_cases tc ON tc.id = bl.test_case_id
      WHERE 1=1 ${squadFilter}
      GROUP BY bl.test_case_id ORDER BY bug_count DESC LIMIT 10
    `, squadParams);

    res.json({ global: global[0], by_cycle: byCycle, critical_open: criticalOpen, trend, top_cases: topCases });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

