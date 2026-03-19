const db = require('../config/db')

// ── Relatório de Cobertura por Unidade de Negócio ─────────────
exports.coverageReport = async (req, res) => {
  try {
    // 1. Busca todas as unidades ativas
    const [units] = await db.query(`
      SELECT bu.*,
        COUNT(DISTINCT tc.id) AS total_cases,
        COUNT(DISTINCT CASE WHEN tc.automation_status = 'automated' THEN tc.id END) AS automated_cases,
        COUNT(DISTINCT CASE WHEN te.status = 'passed'  THEN te.id END) AS passed_executions,
        COUNT(DISTINCT CASE WHEN te.status = 'failed'  THEN te.id END) AS failed_executions,
        COUNT(DISTINCT CASE WHEN te.status = 'blocked' THEN te.id END) AS blocked_executions,
        COUNT(DISTINCT te.id) AS total_executions,
        COUNT(DISTINCT CASE WHEN te.status = 'failed' AND te.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN te.id END) AS failures_30d,
        COUNT(DISTINCT CASE WHEN bl.status IN ('open','in_progress') THEN bl.id END) AS open_bugs,
        COUNT(DISTINCT CASE WHEN bl.status = 'open' AND bl.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN bl.id END) AS bugs_last_7d
      FROM business_units bu
      LEFT JOIN test_cases tc ON tc.business_unit_id = bu.id
      LEFT JOIN test_executions te ON te.test_case_id = tc.id
      LEFT JOIN bug_links bl ON bl.test_case_id = tc.id
      WHERE bu.ativo = 1
      GROUP BY bu.id
      ORDER BY bu.capacidade, bu.dominio, bu.produto
    `)

    // 2. Calcula métricas de risco para cada unidade
    const result = units.map(u => {
      const totalCases      = Number(u.total_cases)
      const totalExec       = Number(u.total_executions)
      const passedExec      = Number(u.passed_executions)
      const failedExec      = Number(u.failed_executions)
      const failures30d     = Number(u.failures_30d)
      const openBugs        = Number(u.open_bugs)
      const bugs7d          = Number(u.bugs_last_7d)

      // Pass rate
      const passRate = totalExec > 0 ? Math.round((passedExec / totalExec) * 100) : null

      // Falha rate
      const failRate = totalExec > 0 ? Math.round((failedExec / totalExec) * 100) : 0

      // Score de risco (0-100)
      let riskScore = 0
      const impactoMultiplier = { alto: 3, medio: 2, baixo: 1 }[u.impacto] || 1

      // Sem cobertura = risco máximo
      if (totalCases === 0) riskScore = 100
      else {
        // Falhas recentes aumentam risco
        if (failures30d > 0) riskScore += Math.min(failures30d * 5, 30) * impactoMultiplier
        // Bugs abertos aumentam risco
        if (openBugs > 0) riskScore += Math.min(openBugs * 10, 30) * impactoMultiplier
        // Bugs recentes (últimos 7 dias) = sinal de PRD comprometido
        if (bugs7d > 0) riskScore += bugs7d * 15 * impactoMultiplier
        // Sem execuções recentes
        if (totalExec === 0) riskScore += 20
        riskScore = Math.min(riskScore, 100)
      }

      // Nível de risco
      let riskLevel = 'baixo'
      if (riskScore >= 70) riskLevel = 'critico'
      else if (riskScore >= 40) riskLevel = 'alto'
      else if (riskScore >= 20) riskLevel = 'medio'

      // Alerta PRD: muitos bugs recentes + impacto alto
      const prdAlert = bugs7d > 0 && u.impacto === 'alto'
        || (failRate > 30 && openBugs > 0 && u.impacto !== 'baixo')

      // Componentes sem cobertura
      const componentesList = (u.componentes || '').split(',').map(c => c.trim()).filter(Boolean)

      return {
        id:              u.id,
        capacidade:      u.capacidade,
        dominio:         u.dominio,
        sub_dominio:     u.sub_dominio,
        produto:         u.produto,
        aplicacao:       u.aplicacao,
        impacto:         u.impacto,
        componentes:     componentesList,
        total_cases:     totalCases,
        automated_cases: Number(u.automated_cases),
        total_executions: totalExec,
        passed_executions: passedExec,
        failed_executions: failedExec,
        blocked_executions: Number(u.blocked_executions),
        failures_30d:    failures30d,
        open_bugs:       openBugs,
        bugs_last_7d:    bugs7d,
        pass_rate:       passRate,
        fail_rate:       failRate,
        risk_score:      Math.round(riskScore),
        risk_level:      riskLevel,
        prd_alert:       prdAlert,
        covered:         totalCases > 0,
      }
    })

    // 3. Resumo geral
    const total     = result.length
    const covered   = result.filter(r => r.covered).length
    const criticos  = result.filter(r => r.risk_level === 'critico').length
    const altos     = result.filter(r => r.risk_level === 'alto').length
    const prdAlerts = result.filter(r => r.prd_alert).length

    // 4. Agrupa por capacidade
    const byCapacidade = {}
    result.forEach(r => {
      if (!byCapacidade[r.capacidade]) {
        byCapacidade[r.capacidade] = { capacidade: r.capacidade, units: [], total: 0, covered: 0, risk_max: 0 }
      }
      byCapacidade[r.capacidade].units.push(r)
      byCapacidade[r.capacidade].total++
      if (r.covered) byCapacidade[r.capacidade].covered++
      if (r.risk_score > byCapacidade[r.capacidade].risk_max) {
        byCapacidade[r.capacidade].risk_max = r.risk_score
      }
    })

    res.json({
      summary: { total, covered, uncovered: total - covered, criticos, altos, prd_alerts: prdAlerts,
        coverage_pct: total > 0 ? Math.round((covered / total) * 100) : 0 },
      by_capacidade: Object.values(byCapacidade),
      units: result,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
