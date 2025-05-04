const express = require('express');
const Podcast = require('../models/Podcast');
const router = express.Router();
const _ = require('lodash');
const { setCache, getCache } = require('../utils/cache');

// Get all podcasts
router.get('/', async (req, res) => {
  try {
    const {
      source,
      category,
      page = 1,
      limit = 25,
      sort = 'newest'
    } = req.query;

    const query = {};
    if (source) query.source = source;
    if (category) query.category = category;

    const parsedPage = Math.max(Number(page) || 1, 1);
    const parsedLimit = Math.min(Number(limit) || 25, 100);
    const skip = (parsedPage - 1) * parsedLimit;

    let podcasts = [];
    let total = await Podcast.countDocuments(query);

    const cacheKey = `podcasts:${sort}:${source || 'all'}:${category || 'all'}`;

    switch (sort) {
      case 'newest':
        podcasts = await Podcast.find(query)
          .sort({ pubDate: -1 })
          .skip(skip)
          .limit(parsedLimit);
        break;

      case 'popular':
        podcasts = await Podcast.find(query)
          .sort({ views: -1 })
          .skip(skip)
          .limit(parsedLimit);
        break;

      case 'random':
        // Try cache first
        let randomCache = getCache(cacheKey);
        if (randomCache) {
          podcasts = randomCache.slice(skip, skip + parsedLimit);
        } else {
          const randomPodcasts = await Podcast.aggregate([
            { $match: query },
            { $sample: { size: 500 } }
          ]);
          setCache(cacheKey, randomPodcasts, 300); // 5 minutes
          podcasts = randomPodcasts.slice(skip, skip + parsedLimit);
        }
        break;

      case 'semiRandom':
        let semiRandomCache = getCache(cacheKey);
        if (semiRandomCache) {
          podcasts = semiRandomCache.slice(skip, skip + parsedLimit);
        } else {
          const recentPodcasts = await Podcast.find(query)
            .sort({ pubDate: -1 })
            .limit(500);
          const shuffled = _.shuffle(recentPodcasts);
          setCache(cacheKey, shuffled, 300); // 5 minutes
          podcasts = shuffled.slice(skip, skip + parsedLimit);
        }
        break;

      default:
        return res.status(400).json({ error: `Invalid sort method: ${sort}` });
    }

    res.json({
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages: Math.ceil(total / parsedLimit),
      nextPage: parsedPage * parsedLimit < total ? parsedPage + 1 : null,
      prevPage: parsedPage > 1 ? parsedPage - 1 : null,
      sort,
      podcasts
    });

  } catch (err) {
    console.error('[Error] Failed to fetch podcasts:', err.message);
    res.status(500).json({ error: 'Failed to fetch podcasts' });
  }
});

// Get podcasts by source
router.get('/source/:source', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;

    const total = await Podcast.countDocuments({ source: req.params.source });
    const podcasts = await Podcast.find({ source: req.params.source })
      .sort({ pubDate: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      nextPage: page * limit < total ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
      podcasts
    });
  } catch (err) {
    console.error('[Error] Failed to fetch podcasts by source:', err.message);
    res.status(500).json({ error: 'Failed to fetch podcasts by source' });
  }
});

// Get podcasts by category
router.get('/category/:category', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;

    const total = await Podcast.countDocuments({ category: req.params.category });
    const podcasts = await Podcast.find({ category: req.params.category })
      .sort({ pubDate: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      nextPage: page * limit < total ? page + 1 : null,
      prevPage: page > 1 ? page - 1 : null,
      podcasts
    });
  } catch (err) {
    console.error('[Error] Failed to fetch podcasts by category:', err.message);
    res.status(500).json({ error: 'Failed to fetch podcasts by category' });
  }
});

module.exports = router;