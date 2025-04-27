const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: String,
  description: String,
  link: String,
  guid: String,
  pubDate: Date,
  image: String,
  category: String,
  source: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: Date,
});

module.exports = mongoose.model('Article', articleSchema);
