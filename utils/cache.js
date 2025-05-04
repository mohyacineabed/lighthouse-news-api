const cache = new Map();

function setCache(key, data, ttlSeconds = 300) {
  cache.set(key, {
    data,
    expiry: Date.now() + ttlSeconds * 1000
  });
}

function getCache(key) {
  const cached = cache.get(key);
  if (!cached) return null;

  if (Date.now() > cached.expiry) {
    cache.delete(key);
    return null;
  }

  return cached.data;
}

module.exports = { setCache, getCache };
