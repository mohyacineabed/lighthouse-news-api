const express = require('express');
const mongoose = require('mongoose');
const routes = require('./routes');
const cors = require('cors');
const newsRoutes = require('./routes/news');
const podcastRoutes = require('./routes/podcasts');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

app.use(express.json());
app.use('/api', routes);
app.use('/api/news', newsRoutes);
app.use('/api/podcasts', podcastRoutes);

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('[MongoDB] Connected successfully');
    app.listen(PORT, () => console.log(`[Server] Running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('[MongoDB] Connection error:', err.message);
  });
