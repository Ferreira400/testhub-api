const router  = require('express').Router();
const auth    = require('../middlewares/auth');

const authCtrl        = require('../controllers/authController');
const usersCtrl       = require('../controllers/usersController');
const squadsCtrl      = require('../controllers/squadsController');
const projectsCtrl    = require('../controllers/projectsController');
const testCasesCtrl   = require('../controllers/testCasesController');
const testPlansCtrl   = require('../controllers/testPlansController');
const cyclesCtrl      = require('../controllers/testCyclesController');
const executionsCtrl  = require('../controllers/executionsController');
const reportsCtrl     = require('../controllers/reportsController');

// Auth (publico)
router.post('/auth/register', authCtrl.register);
router.post('/auth/login',    authCtrl.login);
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
router.get('/reports/squad/:squadId', auth, reportsCtrl.bySquad);

module.exports = router;