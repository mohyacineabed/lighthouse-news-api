const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const _ = require('lodash');
const { setCache, getCache } = require('../utils/cache'); 

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

    let articles = [];
    let total = await Article.countDocuments(query);

    const cacheKey = `news:${sort}:${source || 'all'}:${category || 'all'}`;

    switch (sort) {
      case 'newest':
        articles = await Article.find(query)
          .sort({ pubDate: -1 })
          .skip(skip)
          .limit(parsedLimit);
        break;

      case 'popular':
        articles = await Article.find(query)
          .sort({ views: -1 })
          .skip(skip)
          .limit(parsedLimit);
        break;

      case 'random':
        // Try cache first
        let randomCache = getCache(cacheKey);
        if (randomCache) {
          articles = randomCache.slice(skip, skip + parsedLimit);
        } else {
          const randomArticles = await Article.aggregate([
            { $match: query },
            { $sample: { size: 500 } }
          ]);
          setCache(cacheKey, randomArticles, 300); // 5 minutes
          articles = randomArticles.slice(skip, skip + parsedLimit);
        }
        break;

      case 'semiRandom':
        let semiRandomCache = getCache(cacheKey);
        if (semiRandomCache) {
          articles = semiRandomCache.slice(skip, skip + parsedLimit);
        } else {
          const recentArticles = await Article.find(query)
            .sort({ pubDate: -1 })
            .limit(500);
          const shuffled = _.shuffle(recentArticles);
          setCache(cacheKey, shuffled, 300); // 5 minutes
          articles = shuffled.slice(skip, skip + parsedLimit);
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
      articles
    });

  } catch (err) {
    console.error('[Error] Failed to fetch articles:', err.message);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// Get articles by source
router.get('/source/:source', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const articles = await Article.find({ source: req.params.source })
      .sort({ pubDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Article.countDocuments({ source: req.params.source });

    res.json({
      articles,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalArticles: total
    });
  } catch (err) {
    console.error('[Error] Failed to fetch articles by source:', err.message);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// Get articles by category
router.get('/category/:category', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const articles = await Article.find({ category: req.params.category })
      .sort({ pubDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Article.countDocuments({ category: req.params.category });

    res.json({
      articles,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalArticles: total
    });
  } catch (err) {
    console.error('[Error] Failed to fetch articles by category:', err.message);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

module.exports = router;
