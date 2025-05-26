const { MongoClient } = require('mongodb');
const { MeiliSearch } = require('meilisearch');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = 'lighthouse-news-api';
const COLLECTION = 'articles';

const MEILI_HOST = 'http://127.0.0.1:7700';
const INDEX_NAME = 'articles';

// Define a reasonable batch size to avoid payload size limits
// You might need to adjust this based on your document size
const BATCH_SIZE = 1000;

async function indexArticles() {
  const mongo = new MongoClient(MONGO_URI);
  const meili = new MeiliSearch({
    host: MEILI_HOST,
    apiKey: process.env.MEILI_API_KEY,
  });

  try {
    await mongo.connect();
    console.log('Connected to MongoDB');
    
    const db = mongo.db(DB_NAME);
    const collection = db.collection(COLLECTION);
    
    // Get the total number of documents to index
    const totalDocuments = await collection.countDocuments();
    console.log(`Found ${totalDocuments} documents to index`);

    // Create the index if it doesn't exist
    const index = meili.index(INDEX_NAME);
    
    // Initialize counters
    let processedCount = 0;
    let batchNumber = 1;
    
    // Process documents in batches
    const cursor = collection.find({});
    
    let batch = [];
    
    for await (const article of cursor) {
      // Sanitize and prepare the document
      const sanitizedId = sanitizeId(article.guid);
      
      batch.push({
        id: sanitizedId,
        title: article.title,
        description: article.description,
        link: article.link,
        pubDate: article.pubDate,
        image: article.image,
        category: article.category,
        source: article.source,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
      });
      
      // When we reach the batch size, index and clear the batch
      if (batch.length >= BATCH_SIZE) {
        console.log(`Processing batch ${batchNumber} with ${batch.length} documents...`);
        await indexBatch(index, batch);
        
        processedCount += batch.length;
        console.log(`Indexed ${processedCount}/${totalDocuments} documents (${Math.round((processedCount/totalDocuments)*100)}%)`);
        
        batch = [];
        batchNumber++;
      }
    }
    
    // Index any remaining documents in the last batch
    if (batch.length > 0) {
      console.log(`Processing final batch with ${batch.length} documents...`);
      await indexBatch(index, batch);
      processedCount += batch.length;
    }

    console.log(`✅ Successfully indexed ${processedCount} documents to Meilisearch.`);
  } catch (err) {
    console.error('❌ Error indexing articles:', err);
  } finally {
    await mongo.close();
    console.log('MongoDB connection closed');
  }
}

async function indexBatch(index, batch) {
  try {
    await index.addDocuments(batch, { primaryKey: 'id' });
    return true;
  } catch (error) {
    console.error('Error indexing batch:', error);
    
    // If the batch is still too large, try to split it in half and retry recursively
    if (error.response?.status === 413 && batch.length > 1) {
      console.log(`Batch too large (${batch.length} documents), splitting and retrying...`);
      
      const midpoint = Math.floor(batch.length / 2);
      const firstHalf = batch.slice(0, midpoint);
      const secondHalf = batch.slice(midpoint);
      
      console.log(`Split into batches of ${firstHalf.length} and ${secondHalf.length} documents`);
      
      await indexBatch(index, firstHalf);
      await indexBatch(index, secondHalf);
      return true;
    }
    
    throw error;
  }
}

function sanitizeId(id) {
  // If the ID is empty, generate a fallback ID using timestamp
  if (!id) {
    return `fallback-id-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  }

  // Replace non-alphanumeric characters with underscores and ensure it's within MeiliSearch's limitations
  return id.toString().replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 511);
}

// Run the indexing process
indexArticles().catch(console.error);