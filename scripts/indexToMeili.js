const { MongoClient } = require("mongodb");
const { MeiliSearch } = require("meilisearch");
require("dotenv").config();

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = "lighthouse-news-api";
const COLLECTION = "articles";

const MEILI_HOST = "http://127.0.0.1:7700";
const INDEX_NAME = "articles";

async function indexArticles() {
  const mongo = new MongoClient(MONGO_URI);
  const meili = new MeiliSearch({
    host: MEILI_HOST,
    apiKey: process.env.MEILI_API_KEY,
  });

  try {
    await mongo.connect();
    const db = mongo.db(DB_NAME);
    const articles = await db.collection(COLLECTION).find({}).toArray();

    const sanitizeId = (id) => {
      if (!id) {
        return `fallback-id-${Date.now()}`;
      }

      return id.replace(/[^a-zA-Z0-9-_]/g, "_").substring(0, 511);
    };

    const payload = articles.map((a) => {
      const sanitizedId = sanitizeId(a.guid);
      return {
        id: sanitizedId, 
        title: a.title,
        description: a.description,
        link: a.link,
        pubDate: a.pubDate,
        image: a.image,
        category: a.category,
        source: a.source,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      };
    });

    const index = meili.index(INDEX_NAME);

    // Explicitly set the primary key (guid)
    await index.addDocuments(payload, { primaryKey: "id" });

    console.log(`Indexed ${payload.length} articles to Meilisearch.`);
  } catch (err) {
    console.error("Error indexing articles:", err);
  } finally {
    await mongo.close();
  }
}

indexArticles();
