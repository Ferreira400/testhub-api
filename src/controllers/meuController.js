/**
 * TEMPLATE DE CONTROLLER COM BEST PRACTICES
 * Copie este padrão para novos controllers
 */

const db = require('../config/db');

/**
 * GET /recurso
 * Listagem com paginação
 */
exports.list = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page || 1);
    const limit = Math.min(parseInt(req.query.limit || 20), 100);
    const offset = (page - 1) * limit;

    // Sua lógica SQL aqui
    const [rows] = await db.query(
      'SELECT * FROM sua_tabela LIMIT ? OFFSET ?',
      [limit, offset]
    );
    const [[{ total }]] = await db.query('SELECT COUNT(*) as total FROM sua_tabela');

    res.json({
      data: rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });

  } catch (err) {
    next(err); // Passa para error handler global
  }
};

/**
 * GET /recurso/:id
 */
exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(
      'SELECT * FROM sua_tabela WHERE id = ?',
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Recurso não encontrado' });
    }

    res.json(rows[0]);

  } catch (err) {
    next(err);
  }
};

/**
 * POST /recurso
 */
exports.create = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const userId = req.user.id; // Do middleware auth

    // Validação extra se necessário (além de validates.js)
    // ...

    const [result] = await db.query(
      'INSERT INTO sua_tabela (id, name, description, created_by) VALUES (UUID(), ?, ?, ?)',
      [name, description, userId]
    );

    res.status(201).json({
      message: 'Criado com sucesso',
      id: result.insertId
    });

  } catch (err) {
    next(err);
  }
};

/**
 * PUT /recurso/:id
 */
exports.update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    // Verifica existência
    const [exists] = await db.query('SELECT id FROM sua_tabela WHERE id = ?', [id]);
    if (!exists.length) {
      return res.status(404).json({ error: 'Recurso não encontrado' });
    }

    await db.query(
      'UPDATE sua_tabela SET name = ?, description = ? WHERE id = ?',
      [name, description, id]
    );

    res.json({ message: 'Atualizado com sucesso' });

  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /recurso/:id
 */
exports.remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [result] = await db.query(
      'DELETE FROM sua_tabela WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Recurso não encontrado' });
    }

    res.json({ message: 'Deletado com sucesso' });

  } catch (err) {
    next(err);
  }
};

/**
 * Padrão de Error Handling:
 * 
 * 1. SEMPRE termine com try-catch
 * 2. SEMPRE chame next(err) ao invés de res.status().json()
 * 3. O error handler global em server.js tratará:
 *    - MySQL errors (FK, DUP_ENTRY, etc)
 *    - Validation errors
 *    - Stack traces em dev, mensagens simples em prod
 *
 * 4. Apenas retorne res.status(404/409/400) para casos previsíveis:
 *    - Recurso não encontrado: 404
 *    - Duplicado/Conflito: 409
 *    - Dados inválidos (extra): 400
 *
 * 5. Deixe erros SQL e imprevisto passarem para next(err)
 */
