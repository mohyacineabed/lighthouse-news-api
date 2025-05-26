const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const _ = require('lodash');
const { setCache, getCache } = require('../utils/cache'); 

// Helper function to dynamically calculate articles per source based on category and total sources
function calculateArticlesPerSource(sourceCount, category, limit, page) {
  // Base number of articles per source
  let baseCount = Math.max(2, Math.ceil(limit / Math.min(sourceCount, 20)));
  
  // Adjust based on category characteristics and source count
  switch(category) {
    case 'science':
      // Science needs more sources, so we'll take more articles from each to fill the page
      return Math.min(6, baseCount + 2);
    case 'technology':
      // Technology has moderate source count
      return Math.min(4, baseCount + 1);
    case 'entertainment':
    case 'sports':
      // These categories have many sources, so keep article count low
      return Math.min(3, baseCount);
    case 'world':
      // For world news, ensure regional diversity by limiting articles per source
      return Math.min(2, baseCount);
    case 'business':
      // Business sources have different posting frequencies
      return sourceCount < 15 ? Math.min(4, baseCount + 1) : Math.min(3, baseCount);
    default:
      return Math.min(3, baseCount);
  }
}

// Helper function for balanced source distribution
async function getBalancedArticles(query, page, limit) {
  // Get distinct sources with category-specific time windows
  const timeWindow = query.category === 'science' ? 14 : 7; // Science articles stay relevant longer
  
  const distinctSources = await Article.distinct('source', {
    ...query,
    pubDate: { 
      $gte: new Date(Date.now() - timeWindow * 24 * 60 * 60 * 1000) 
    }
  });

  // For better pagination, use a sliding window of sources
  const sourcesPerPage = Math.min(25, Math.ceil(distinctSources.length / 2));
  const overlapSources = Math.floor(sourcesPerPage / 4); // 25% overlap between pages
  
  // Calculate which sources to use for this page with improved rotation
  let selectedSources;
  if (distinctSources.length <= sourcesPerPage) {
    selectedSources = distinctSources;
  } else {
    const startIdx = ((page - 1) * (sourcesPerPage - overlapSources)) % distinctSources.length;
    selectedSources = [
      ...distinctSources.slice(startIdx),
      ...distinctSources.slice(0, startIdx)
    ].slice(0, sourcesPerPage);

    // For world news, ensure regional diversity
    if (query.category === 'world') {
      const regions = {
        asia: ['channelnewsasia', 'japantimes', 'thehindubusinessline'],
        europe: ['bbc', 'france24', 'euronews', 'express'],
        namerica: ['cbc', 'cbsnews', 'nypost'],
        global: ['reuters', 'wsj', 'rt']
      };
      
      // Ensure at least one source from each region if possible
      const regionalSources = Object.values(regions).flat();
      const availableRegionalSources = selectedSources.filter(s => regionalSources.includes(s));
      if (availableRegionalSources.length < Object.keys(regions).length) {
        // Add sources from missing regions
        const missingRegions = Object.values(regions)
          .filter(region => !region.some(s => selectedSources.includes(s)))
          .flat();
        const additionalSources = missingRegions.slice(0, sourcesPerPage - selectedSources.length);
        selectedSources = [...new Set([...selectedSources, ...additionalSources])];
      }
    }
  }

  // Calculate articles per source dynamically
  const articlesPerSource = calculateArticlesPerSource(
    selectedSources.length,
    query.category,
    limit,
    page
  );

  // Get most recent articles from selected sources
  const articlesPromises = selectedSources.map(src => 
    Article.find({ 
      ...query, 
      source: src,
      pubDate: { 
        $gte: new Date(Date.now() - timeWindow * 24 * 60 * 60 * 1000) 
      }
    })
    .sort({ pubDate: -1 })
    .limit(articlesPerSource)
  );

  const sourceArticles = await Promise.all(articlesPromises);
  
  // Interleave articles more evenly while maintaining chronological order
  const articles = sourceArticles
    .filter(articles => articles.length > 0)
    .reduce((acc, sourceArticles, sourceIndex) => {
      sourceArticles.forEach((article, articleIndex) => {
        const position = articleIndex * selectedSources.length + sourceIndex;
        acc[position] = article;
      });
      return acc;
    }, [])
    .filter(Boolean)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  // Apply limit after sorting to ensure we get the most recent articles
  return articles.slice(0, limit);
}

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

    let articles = [];
    
    try {
      const total = await Article.countDocuments(query);
      
      if (total === 0) {
        return res.json({
          page: parsedPage,
          limit: parsedLimit,
          total: 0,
          totalPages: 0,
          articles: []
        });
      }

      const cacheKey = `news:${sort}:${source || 'all'}:${category || 'all'}:${parsedPage}`;
      let cachedArticles = getCache(cacheKey);

      if (cachedArticles) {
        articles = cachedArticles;
      } else {
        switch (sort) {
          case 'newest':
            if (source) {
              articles = await Article.find(query)
                .sort({ pubDate: -1 })
                .skip((parsedPage - 1) * parsedLimit)
                .limit(parsedLimit);
            } else {
              articles = await getBalancedArticles(query, parsedPage, parsedLimit);
              setCache(cacheKey, articles, 300); // Cache for 5 minutes
            }
            break;

          case 'popular':
            articles = await Article.find(query)
              .sort({ views: -1 })
              .skip((parsedPage - 1) * parsedLimit)
              .limit(parsedLimit);
            break;

          case 'random':
            let randomCache = getCache(cacheKey);
            if (randomCache) {
              articles = randomCache;
            } else {
              // Get random sources first
              const distinctSources = await Article.distinct('source', query);
              const selectedSources = _.sampleSize(distinctSources, Math.min(10, distinctSources.length));
              
              // Get articles from selected sources
              articles = await Article.find({
                ...query,
                source: { $in: selectedSources }
              })
                .sort({ pubDate: -1 })
                .limit(parsedLimit * 2);

              articles = _.shuffle(articles).slice(0, parsedLimit);
              setCache(cacheKey, articles, 300);
            }
            break;

          case 'semiRandom':
            let semiRandomCache = getCache(cacheKey);
            if (semiRandomCache) {
              articles = semiRandomCache;
            } else {
              const distinctSources = await Article.distinct('source', {
                ...query,
                pubDate: { 
                  $gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) 
                }
              });

              const selectedSources = _.sampleSize(distinctSources, Math.min(15, distinctSources.length));
              
              articles = await Article.find({
                ...query,
                source: { $in: selectedSources },
                pubDate: { 
                  $gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) 
                }
              })
                .sort({ pubDate: -1 })
                .limit(parsedLimit * 2);

              articles = _.shuffle(articles).slice(0, parsedLimit);
              setCache(cacheKey, articles, 300);
            }
            break;

          default:
            return res.status(400).json({ error: `Invalid sort method: ${sort}` });
        }
      }

      res.json({
        page: parsedPage,
        limit: parsedLimit,
        total,
        totalPages: Math.ceil(total / parsedLimit),
        nextPage: parsedPage * parsedLimit < total ? parsedPage + 1 : null,
        prevPage: parsedPage > 1 ? parsedPage - 1 : null,
        sort,
        articles,
        sourcesCount: _.uniq(articles.map(a => a.source)).length
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

    const query = { source: req.params.source };
    const articles = await Article.find(query)
      .sort({ pubDate: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Article.countDocuments(query);

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

// Get articles by category with balanced source distribution
router.get('/category/:category', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    
    const query = { category: req.params.category };
    const total = await Article.countDocuments(query);

    // Use the balanced distribution helper function
    const articles = await getBalancedArticles(query, page, limit);

    res.json({
      articles,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalArticles: total,
      sourcesCount: _.uniq(articles.map(a => a.source)).length
    });
  } catch (err) {
    console.error('[Error] Failed to fetch articles by category:', err.message);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

module.exports = router;
