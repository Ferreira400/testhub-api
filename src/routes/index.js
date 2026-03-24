const router  = require('express').Router();
const auth    = require('../middlewares/auth');
const {
  loginLimiter,
  registerLimiter,
  verifyJiraWebhookSignature,
} = require('../middlewares/security');
const {
  authValidators,
  uuidValidator,
  userIdValidator,
  paginationValidator,
  squadsValidators,
  projectsValidators,
} = require('../utils/validators');

const authCtrl        = require('../controllers/authController');
const usersCtrl       = require('../controllers/usersController');
const squadsCtrl      = require('../controllers/squadsController');
const projectsCtrl    = require('../controllers/projectsController');
const testCasesCtrl   = require('../controllers/testCasesController');
const testPlansCtrl   = require('../controllers/testPlansController');
const cyclesCtrl      = require('../controllers/testCyclesController');
const executionsCtrl  = require('../controllers/executionsController');
const reportsCtrl     = require('../controllers/reportsController');

// ════════════════════════════════════════════════════════════════
// AUTH (publico - mas com validacao e rate limiting)
// ════════════════════════════════════════════════════════════════
router.post('/auth/register', registerLimiter, authValidators.register, authCtrl.register);
router.post('/auth/login',    loginLimiter,    authValidators.login,    authCtrl.login);
router.get ('/auth/me',       auth, authCtrl.me);

// Users
router.get   ('/users',     auth, usersCtrl.list);
router.get   ('/users/:id', auth, usersCtrl.getById);
router.put   ('/users/:id', auth, usersCtrl.update);
router.delete('/users/:id', auth, usersCtrl.remove);

// Squads
router.get   ('/squads',                     auth, squadsCtrl.list);
router.get   ('/squads/:id',                 auth, squadsCtrl.getById);
router.post  ('/squads',                     auth, squadsCtrl.create);
router.put   ('/squads/:id',                 auth, squadsCtrl.update);
router.delete('/squads/:id',                 auth, squadsCtrl.remove);
router.post  ('/squads/:id/members',         auth, squadsCtrl.addMember);
router.delete('/squads/:id/members/:userId', auth, squadsCtrl.removeMember);

// Projects
router.get   ('/projects',     auth, projectsCtrl.list);
router.get   ('/projects/:id', auth, projectsCtrl.getById);
router.post  ('/projects',     auth, projectsCtrl.create);
router.put   ('/projects/:id', auth, projectsCtrl.update);
router.delete('/projects/:id', auth, projectsCtrl.remove);

// Test Plans
router.get ('/test-plans',     auth, testPlansCtrl.list);
router.get ('/test-plans/:id', auth, testPlansCtrl.getById);
router.post('/test-plans',     auth, testPlansCtrl.create);
router.put ('/test-plans/:id', auth, testPlansCtrl.update);

// Test Cases
router.get   ('/test-cases',     auth, testCasesCtrl.list);
router.get   ('/test-cases/:id', auth, testCasesCtrl.getById);
router.post  ('/test-cases',     auth, testCasesCtrl.create);
router.put   ('/test-cases/:id', auth, testCasesCtrl.update);
router.delete('/test-cases/:id', auth, testCasesCtrl.remove);

// Test Cycles
router.get ('/test-cycles',     auth, cyclesCtrl.list);
router.get ('/test-cycles/:id', auth, cyclesCtrl.getById);
router.post('/test-cycles',     auth, cyclesCtrl.create);
router.put ('/test-cycles/:id', auth, cyclesCtrl.update);

// Executions
router.get ('/executions',     auth, executionsCtrl.list);
router.get ('/executions/:id', auth, executionsCtrl.getById);
router.post('/executions',     auth, executionsCtrl.create);
router.put ('/executions/:id', auth, executionsCtrl.update);

// Reports
router.get('/reports/dashboard',      auth, reportsCtrl.dashboard);
router.get('/reports/cycle/:cycleId', auth, reportsCtrl.byCycle);
router.get('/reports/bugs',                    auth, reportsCtrl.bugs);
router.get('/reports/bugs-by-sprint',       auth, reportsCtrl.bugsBySprint);
router.get('/reports/execution-progress',    auth, reportsCtrl.executionProgress);
router.get('/reports/squad/:squadId', auth, reportsCtrl.bySquad);


// ════════════════════════════════════════════════════════════════
// JIRA INTEGRATION (com proteção)
// ════════════════════════════════════════════════════════════════
const jiraCtrl = require('../controllers/jiraController');
router.post('/jira/save-cases',                        auth, jiraCtrl.saveCases);
router.post('/jira/webhook',         verifyJiraWebhookSignature, jiraCtrl.handleWebhook);
router.get ('/jira/links',           auth,  jiraCtrl.listLinks);
router.get ('/jira/generate/:jiraKey',   auth,  jiraCtrl.generateGherkinManual);
router.post('/jira/sync/execution/:executionId', auth, jiraCtrl.syncExecutionToJira);
router.post('/jira/sync/cycle/:cycleId',         auth,  jiraCtrl.syncCycleToJira);

// GitHub OAuth para Copilot
const ghAuth = require('../controllers/githubAuthController');
router.get('/jira/github-auth',        ghAuth.startAuth);
router.get('/jira/github-auth/status', ghAuth.checkStatus);

// Bugs
const bugCtrl = require('../controllers/bugController');
router.get('/bugs',                              auth, bugCtrl.listBugs);
router.patch('/bugs/:id',                        auth, bugCtrl.updateBugStatus);
router.post('/bugs/from-execution/:executionId', auth, bugCtrl.createFromExecution);

// Business Units
const buCtrl = require('../controllers/businessUnitsController')
router.get   ('/business-units',         auth, buCtrl.list)
router.get   ('/business-units/filters', auth, buCtrl.filters)
router.get   ('/business-units/:id',     auth, buCtrl.getById)
router.post  ('/business-units',         auth, buCtrl.create)
router.put   ('/business-units/:id',     auth, buCtrl.update)
router.delete('/business-units/:id',     auth, buCtrl.remove)

// Coverage
const coverageCtrl = require('../controllers/coverageController')
router.get('/coverage/business-units', auth, coverageCtrl.coverageReport)

module.exports = router;







