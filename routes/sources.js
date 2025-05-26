const express = require('express');
const router = express.Router();
const sourcesConfig = require('../config/sources.json');

router.get('/', (req, res) => {
    const { category, sources } = req.query;
    
    // Check if sources parameter is present
    if (sources === undefined) {
        return res.status(400).json({ 
            error: "Missing 'sources' query parameter" 
        });
    }

    const allSources = sourcesConfig.sources;

    // If no category specified, return all sources
    if (!category) {
        return res.json(Object.keys(allSources));
    }

    // Filter sources by category
    const sourcesByCategory = Object.entries(allSources)
        .filter(([_, sourceData]) => 
            sourceData.feeds && Object.keys(sourceData.feeds).includes(category)
        )
        .map(([sourceName]) => sourceName);

    if (sourcesByCategory.length === 0) {
        return res.status(404).json({
            error: `No sources found for category: ${category}`
        });
    }

    res.json(sourcesByCategory);
});

module.exports = router;