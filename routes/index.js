const express = require('express');
const router = express.Router();

const newsRoutes = require('./news');
const sourcesRoutes = require('./sources');

router.use('/news', newsRoutes);
router.use('/', sourcesRoutes);

module.exports = router;
