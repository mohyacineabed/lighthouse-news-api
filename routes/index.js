const express = require('express');
const router = express.Router();

const newsRoutes = require('./news');

router.use('/news', newsRoutes);

module.exports = router;
