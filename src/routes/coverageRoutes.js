const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/coverageController')
const auth = require('../middlewares/auth')

router.get('/business-units', auth, ctrl.coverageReport)

module.exports = router
