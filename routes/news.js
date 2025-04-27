const express = require("express");
const router = express.Router();
const Article = require("../models/Article");
const _ = require("lodash");
const NodeCache = require("node-cache");

// Create an instance of the cache with a default TTL (time-to-live)
const cache = new NodeCache({ stdTTL: 60 * 60, checkperiod: 120 }); // 1 hour TTL, check every 2 minutes

// GET /news
// Query params: ?source=bbc&category=politics&page=1&limit=20
router.get("/", async (req, res) => {
  try {
    const { source, category, page = 1, limit = 25 } = req.query;

    const query = {};
    if (source) query.source = source;
    if (category) query.category = category;

    const parsedPage = Math.max(Number(page) || 1, 1);
    const parsedLimit = Math.min(Number(limit) || 25, 100);
    const skip = (parsedPage - 1) * parsedLimit;

    // Generate a cache key based on the query parameters
    const cacheKey = `news-${JSON.stringify(req.query)}`;

    // Check if the data is already in cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      console.log("Cache hit");
      return res.json(cachedData); // Serve from cache
    }

    // Fetch a larger pool of recent articles
    const rawArticles = await Article.find(query)
      .sort({ pubDate: -1 })
      .limit(100); // Get more to allow better shuffling

    // Shuffle them randomly
    const shuffled = _.shuffle(rawArticles);

    // Slice based on pagination
    const total = await Article.countDocuments(query);
    const articles = await Article.aggregate([
      { $match: query },
      { $sample: { size: parsedLimit } },
    ]);

    const result = {
      page: parsedPage,
      limit: parsedLimit,
      total,
      totalPages: Math.ceil(total / parsedLimit),
      articles,
    };

    // Cache the response for future use
    cache.set(cacheKey, result);

    res.json(result);
  } catch (err) {
    console.error("Error fetching paginated articles:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /news/:id
router.get("/:id", async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ error: "Article not found" });

    res.json(article);
  } catch (err) {
    console.error("Error fetching article by ID:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
