/**
 * Validadores centralizados com express-validator
 * Reutilizável em todas as rotas
 */

const { body, param, query, validationResult } = require('express-validator');

// Middleware para capturar erros de validação
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Dados inválidos',
      errors: errors.array().map(e => ({
        field: e.param,
        message: e.msg,
        value: e.value
      }))
    });
  }
  next();
};

// ═════════════════════════════════════════════════════════════════
// AUTH VALIDATORS
// ═════════════════════════════════════════════════════════════════

const authValidators = {
  register: [
    body('name')
      .trim()
      .notEmpty().withMessage('Nome é obrigatório')
      .isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres'),
    
    body('email')
      .trim()
      .isEmail().withMessage('Email inválido')
      .normalizeEmail(),
    
    body('password')
      .isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres')
      .matches(/[A-Z]/).withMessage('Senha deve ter pelo menos uma letra maiúscula')
      .matches(/[a-z]/).withMessage('Senha deve ter pelo menos uma letra minúscula'),
    
    body('role')
      .optional()
      .isIn(['admin', 'manager', 'qa_engineer', 'viewer']).withMessage('Role inválida'),
    
    handleValidationErrors
  ],

  login: [
    body('email')
      .trim()
      .isEmail().withMessage('Email inválido')
      .normalizeEmail(),
    
    body('password')
      .notEmpty().withMessage('Senha é obrigatória'),
    
    handleValidationErrors
  ],
};

// ═════════════════════════════════════════════════════════════════
// UUID VALIDATORS
// ═════════════════════════════════════════════════════════════════

const uuidValidator = [
  param('id')
    .isUUID().withMessage('ID deve ser um UUID válido'),
  handleValidationErrors
];

const userIdValidator = [
  param('userId')
    .isUUID().withMessage('User ID deve ser um UUID válido'),
  handleValidationErrors
];

// ═════════════════════════════════════════════════════════════════
// USERS VALIDATORS
// ═════════════════════════════════════════════════════════════════

const usersValidators = {
  update: [
    param('id').isUUID().withMessage('ID deve ser um UUID válido'),
    
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres'),
    
    body('email')
      .optional()
      .isEmail().withMessage('Email inválido')
      .normalizeEmail(),
    
    body('role')
      .optional()
      .isIn(['admin', 'manager', 'qa_engineer', 'viewer']).withMessage('Role inválido'),
    
    handleValidationErrors
  ],
};

// ═════════════════════════════════════════════════════════════════
// SQUADS VALIDATORS
// ═════════════════════════════════════════════════════════════════

const squadsValidators = {
  create: [
    body('name')
      .trim()
      .notEmpty().withMessage('Nome é obrigatório')
      .isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres'),
    
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Descrição máximo 500 caracteres'),
    
    handleValidationErrors
  ],

  update: [
    param('id').isUUID().withMessage('ID deve ser um UUID válido'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Descrição máximo 500 caracteres'),
    handleValidationErrors
  ],

  addMember: [
    param('id').isUUID().withMessage('Squad ID deve ser um UUID válido'),
    body('userId')
      .isUUID().withMessage('User ID deve ser um UUID válido'),
    handleValidationErrors
  ],
};

// ═════════════════════════════════════════════════════════════════
// PROJECTS VALIDATORS
// ═════════════════════════════════════════════════════════════════

const projectsValidators = {
  create: [
    body('name')
      .trim()
      .notEmpty().withMessage('Nome é obrigatório')
      .isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres'),
    
    body('description')
      .optional()
      .trim(),
    
    body('status')
      .optional()
      .isIn(['active', 'archived']).withMessage('Status inválido'),
    
    handleValidationErrors
  ],

  update: [
    param('id').isUUID().withMessage('ID deve ser um UUID válido'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 }).withMessage('Nome deve ter entre 2 e 100 caracteres'),
    body('status')
      .optional()
      .isIn(['active', 'archived']).withMessage('Status inválido'),
    handleValidationErrors
  ],
};

// ═════════════════════════════════════════════════════════════════
// PAGINATION VALIDATORS
// ═════════════════════════════════════════════════════════════════

const paginationValidator = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page deve ser um número inteiro positivo'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit deve estar entre 1 e 100'),
  
  handleValidationErrors
];

// ═════════════════════════════════════════════════════════════════
// EXPORTS
// ═════════════════════════════════════════════════════════════════

module.exports = {
  handleValidationErrors,
  uuidValidator,
  userIdValidator,
  paginationValidator,
  authValidators,
  usersValidators,
  squadsValidators,
  projectsValidators,
};
