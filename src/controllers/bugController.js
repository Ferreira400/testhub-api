/**
 * src/controllers/bugController.js
 * Rotas de Bug tracking
 */

const bugService = require('../services/bugService');

// POST /bugs/from-execution/:executionId — cria bug manual
async function createFromExecution(req, res) {
  try {
    const result = await bugService.createBugFromExecution(req.params.executionId);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

// GET /bugs — lista bugs
async function listBugs(req, res) {
  try {
    const { squad_id, cycle_id, status } = req.query;
    const bugs = await bugService.listBugs({ squadId: squad_id, cycleId: cycle_id, status });
    res.json(bugs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Chamado pelo webhook do Jira quando bug é resolvido
async function handleBugResolved(bugKey, status) {
  try {
    await bugService.processBugResolved(bugKey, status);
  } catch (err) {
    console.error('[BUG] Erro ao processar bug resolvido:', err.message);
  }
}

// PATCH /bugs/:id — atualiza status do bug
async function updateBugStatus(req, res) {
  try {
    const { status } = req.body;
    const db = require('../config/db');
    await db.execute('UPDATE bug_links SET status = ?, resolved_at = IF(? = \'resolved\', NOW(), resolved_at) WHERE id = ?', [status, status, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = { createFromExecution, listBugs, handleBugResolved, updateBugStatus };
