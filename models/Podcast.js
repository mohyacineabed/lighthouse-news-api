const mongoose = require('mongoose');

const PodcastSchema = new mongoose.Schema({
  title: { type: String, required: true }, // Title of the podcast episode
  description: { type: String }, // Description or summary of the episode
  link: { type: String, required: true }, // Link to the podcast episode
  guid: { type: String, unique: true, required: true }, // Unique identifier for the episode
  pubDate: { type: Date, required: true }, // Publication date of the episode
  image: { type: String }, // URL of the episode's image or thumbnail
  duration: { type: Number }, // Duration of the episode in seconds
  explicit: { type: Boolean, default: false }, // Whether the episode is explicit
  episodeType: { type: String, enum: ['full', 'trailer', 'bonus'], default: 'full' }, // Type of episode
  source: { type: String, required: true }, // Source identifier (e.g., NPR, Democracy Now)
  fetchedAt: { type: Date, default: Date.now }, // Timestamp when the episode was fetched
  author: { type: String }, // Author or creator of the episode
  season: { type: Number }, // Season number (if available)
  enclosure: {
    url: { type: String }, // URL of the audio file
    length: { type: Number }, // Length of the audio file in bytes
    type: { type: String }, // MIME type of the audio file
  },
});

module.exports = mongoose.model('Podcast', PodcastSchema);