const db = require('../config/db')

// ── Listar todas ──────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const { capacidade, dominio, produto, impacto, ativo = 1 } = req.query
    let where = ['1=1']
    const params = []

    if (ativo !== 'all') { where.push('bu.ativo = ?'); params.push(Number(ativo)) }
    if (capacidade) { where.push('bu.capacidade = ?'); params.push(capacidade) }
    if (dominio)    { where.push('bu.dominio = ?');    params.push(dominio) }
    if (produto)    { where.push('bu.produto = ?');    params.push(produto) }
    if (impacto)    { where.push('bu.impacto = ?');    params.push(impacto) }

    const [rows] = await db.query(`
      SELECT
        bu.*,
        u.name AS created_by_name,
        COUNT(DISTINCT tc.id) AS total_cases
      FROM business_units bu
      LEFT JOIN users u ON u.id = bu.created_by
      LEFT JOIN test_cases tc ON tc.business_unit_id = bu.id
      WHERE ${where.join(' AND ')}
      GROUP BY bu.id
      ORDER BY bu.capacidade, bu.dominio, bu.produto
    `, params)

    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}

// ── Buscar por ID ─────────────────────────────────────────────
exports.getById = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT bu.*, u.name AS created_by_name,
        COUNT(DISTINCT tc.id) AS total_cases
      FROM business_units bu
      LEFT JOIN users u ON u.id = bu.created_by
      LEFT JOIN test_cases tc ON tc.business_unit_id = bu.id
      WHERE bu.id = ?
      GROUP BY bu.id
    `, [req.params.id])

    if (!rows.length) return res.status(404).json({ error: 'Unidade não encontrada' })
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Criar ─────────────────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    const { role } = req.user
    if (!['admin', 'manager'].includes(role)) {
      return res.status(403).json({ error: 'Apenas Admin e Manager podem criar Unidades de Negócio' })
    }

    const {
      capacidade, dominio, sub_dominio, produto,
      aplicacao, processo_negocio, impacto, componentes
    } = req.body

    if (!capacidade || !dominio || !sub_dominio || !produto || !aplicacao || !processo_negocio || !componentes) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' })
    }

    const [result] = await db.query(`
      INSERT INTO business_units
        (capacidade, dominio, sub_dominio, produto, aplicacao, processo_negocio, impacto, componentes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [capacidade, dominio, sub_dominio, produto, aplicacao, processo_negocio, impacto || 'medio', componentes, req.user.id])

    const [rows] = await db.query('SELECT * FROM business_units WHERE id = LAST_INSERT_ID()')
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}

// ── Atualizar ─────────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const { role } = req.user
    if (!['admin', 'manager'].includes(role)) {
      return res.status(403).json({ error: 'Apenas Admin e Manager podem editar Unidades de Negócio' })
    }

    const {
      capacidade, dominio, sub_dominio, produto,
      aplicacao, processo_negocio, impacto, componentes, ativo
    } = req.body

    await db.query(`
      UPDATE business_units SET
        capacidade = COALESCE(?, capacidade),
        dominio = COALESCE(?, dominio),
        sub_dominio = COALESCE(?, sub_dominio),
        produto = COALESCE(?, produto),
        aplicacao = COALESCE(?, aplicacao),
        processo_negocio = COALESCE(?, processo_negocio),
        impacto = COALESCE(?, impacto),
        componentes = COALESCE(?, componentes),
        ativo = COALESCE(?, ativo)
      WHERE id = ?
    `, [capacidade, dominio, sub_dominio, produto, aplicacao,
        processo_negocio, impacto, componentes, ativo, req.params.id])

    const [rows] = await db.query('SELECT * FROM business_units WHERE id = ?', [req.params.id])
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Remover ───────────────────────────────────────────────────
exports.remove = async (req, res) => {
  try {
    const { role } = req.user
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Apenas Admin pode remover Unidades de Negócio' })
    }

    const [cases] = await db.query(
      'SELECT COUNT(*) as total FROM test_cases WHERE business_unit_id = ?',
      [req.params.id]
    )
    if (cases[0].total > 0) {
      return res.status(400).json({
        error: `Não é possível remover: ${cases[0].total} caso(s) vinculado(s). Desative ao invés de remover.`
      })
    }

    await db.query('DELETE FROM business_units WHERE id = ?', [req.params.id])
    res.json({ message: 'Unidade removida com sucesso' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

// ── Filtros disponíveis ───────────────────────────────────────
exports.filters = async (req, res) => {
  try {
    const [caps]  = await db.query('SELECT DISTINCT capacidade FROM business_units WHERE ativo=1 ORDER BY capacidade')
    const [doms]  = await db.query('SELECT DISTINCT dominio FROM business_units WHERE ativo=1 ORDER BY dominio')
    const [prods] = await db.query('SELECT DISTINCT produto FROM business_units WHERE ativo=1 ORDER BY produto')
    res.json({
      capacidades: caps.map(r => r.capacidade),
      dominios:    doms.map(r => r.dominio),
      produtos:    prods.map(r => r.produto),
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
