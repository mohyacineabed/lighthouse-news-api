const express = require('express');
const mongoose = require('mongoose');
const routes = require('./routes');
const cors = require('cors');
const newsRoutes = require('./routes/news');
const podcastRoutes = require('./routes/podcasts');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = "mongodb+srv://lighthouse:yacinemo@cluster0.h0azuzo.mongodb.net/lighthouse-news-api?retryWrites=true&w=majority&appName=Cluster0";

app.use(cors());
app.use(express.json());
app.use('/api', routes);
app.use('/api/news', newsRoutes);
app.use('/api/podcasts', podcastRoutes);

// MongoDB connection options
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

// Connect to MongoDB
mongoose.connect(MONGO_URI, mongooseOptions)
  .then(() => {
    console.log('[MongoDB] Connected successfully to Atlas');
    app.listen(PORT, () => console.log(`[Server] Running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('[MongoDB] Connection error:', err.message);
    process.exit(1);
  });

// Handle MongoDB connection errors
mongoose.connection.on('error', err => {
  console.error('[MongoDB] Connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('[MongoDB] Disconnected from database');
});

process.on('SIGINT', () => {
  mongoose.connection.close(() => {
    console.log('[MongoDB] Connection closed through app termination');
    process.exit(0);
  });
});
