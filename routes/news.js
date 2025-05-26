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
    
    try {
      const total = await Article.countDocuments(query);
      console.log(`[Query] Found ${total} total articles matching query:`, query);
      
      if (total === 0) {
        return res.json({
          page: parsedPage,
          limit: parsedLimit,
          total: 0,
          totalPages: 0,
          articles: []
        });
      }

      const cacheKey = `news:${sort}:${source || 'all'}:${category || 'all'}`;

      switch (sort) {
        case 'newest':
          if (source) {
            articles = await Article.find(query)
              .sort({ pubDate: -1 })
              .skip(skip)
              .limit(parsedLimit);
          } else {
            // Calculate articles per source based on the requested limit
            // For limit=25, we'll allow ~5 articles per source
            // For limit=50, we'll allow ~8 articles per source
            // For limit=100, we'll allow ~12 articles per source
            const articlesPerSource = Math.max(5, Math.floor(Math.sqrt(parsedLimit) * 2));
            
            // Get balanced results from all sources with memory-efficient approach
            const pipeline = [
              { 
                $match: query 
              },
              // First get the most recent article date for each source
              {
                $group: {
                  _id: "$source",
                  mostRecent: { $max: "$pubDate" }
                }
              },
              // Sort sources by their most recent article
              { 
                $sort: { mostRecent: -1 } 
              },
              // Now get articles for each source
              {
                $lookup: {
                  from: "articles",
                  let: { source: "$_id", recent: "$mostRecent" },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $eq: ["$source", "$$source"] },
                            // Get articles from last 3 days for each source
                            { 
                              $gte: [
                                "$pubDate", 
                                { 
                                  $dateSubtract: { 
                                    startDate: "$$recent", 
                                    unit: "day", 
                                    amount: 3 
                                  } 
                                }
                              ] 
                            }
                          ]
                        }
                      }
                    },
                    { $sort: { pubDate: -1 } },
                    { $limit: articlesPerSource }
                  ],
                  as: "articles"
                }
              },
              // Unwind the articles array
              { $unwind: "$articles" },
              // Project only the article fields we need
              {
                $replaceRoot: { newRoot: "$articles" }
              },
              // Sort all articles by date
              { $sort: { pubDate: -1 } },
              // Apply pagination
              { $skip: skip },
              { $limit: parsedLimit }
            ];

            articles = await Article.aggregate(pipeline).allowDiskUse(true);
            console.log(`[Balance] Retrieved ${articles.length} articles from multiple sources`);
          }
          break;

        case 'popular':
          articles = await Article.find(query)
            .sort({ views: -1 })
            .skip(skip)
            .limit(parsedLimit);
          break;

        case 'random':
          let randomCache = getCache(cacheKey);
          if (randomCache) {
            articles = randomCache.slice(skip, skip + parsedLimit);
          } else {
            const randomArticles = await Article.aggregate([
              { $match: query },
              { $sample: { size: 500 } }
            ]);
            setCache(cacheKey, randomArticles, 300);
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
            setCache(cacheKey, shuffled, 300);
            articles = shuffled.slice(skip, skip + parsedLimit);
          }
          break;

        default:
          return res.status(400).json({ error: `Invalid sort method: ${sort}` });
      }

      console.log(`[Response] Returning ${articles.length} articles`);

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
      console.error('[MongoDB] Error fetching articles:', err);
      throw err;
    }

  } catch (err) {
    console.error('[Error] Failed to fetch articles:', err.message);
    res.status(500).json({ error: 'Failed to fetch articles', details: err.message });
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
