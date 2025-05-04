const express = require('express');
const Podcast = require('../models/Podcast');
const router = express.Router();

// Get all podcasts
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Podcast.countDocuments();
    const podcasts = await Podcast.find()
      .sort({ pubDate: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      podcasts,
    });
  } catch (err) {
    console.error('[Error] Failed to fetch podcasts:', err.message);
    res.status(500).json({ error: 'Failed to fetch podcasts' });
  }
});

// Get podcasts by category
router.get('/category/:category', async (req, res) => {
  try {
    const category = req.params.category;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Podcast.countDocuments({ category });
    const podcasts = await Podcast.find({ category })
      .sort({ pubDate: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      podcasts,
    });
  } catch (err) {
    console.error('[Error] Failed to fetch podcasts by category:', err.message);
    res.status(500).json({ error: 'Failed to fetch podcasts by category' });
  }
});

module.exports = router;