const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const logger = require('./logger');

const TIMEOUT = 60000; // 60 seconds
const MAX_RETRIES = 5; // Increase retries to 5
const RETRY_DELAY = 2000; // 2 seconds

// Domain-specific rate limiting settings
const RATE_LIMITS = {
  'www.thestar.com': {
    delay: 5000, // 5 seconds between requests
    maxRetries: 5, // More retries for The Star
    retryDelay: 5000, // 5 seconds between retries
  },
  'default': {
    delay: 2000, // 2 seconds between requests
    maxRetries: 3,
    retryDelay: 2000,
  }
};

// Track last request time per domain
const lastRequestTime = new Map();

// Common browser headers
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0',
};

/**
 * Wait for a specified number of milliseconds
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get domain from URL
 * @param {string} url - URL to extract domain from
 * @returns {string} - Domain name
 */
const getDomain = (url) => {
  try {
    return new URL(url).hostname;
  } catch (error) {
    return url;
  }
};

/**
 * Get rate limit settings for a domain
 * @param {string} domain - Domain name
 * @returns {Object} - Rate limit settings
 */
const getRateLimitSettings = (domain) => {
  return RATE_LIMITS[domain] || RATE_LIMITS.default;
};

/**
 * Wait for rate limit
 * @param {string} url - URL to check rate limit for
 * @returns {Promise<void>}
 */
const waitForRateLimit = async (url) => {
  const domain = getDomain(url);
  const settings = getRateLimitSettings(domain);
  const lastRequest = lastRequestTime.get(domain) || 0;
  const now = Date.now();
  const timeToWait = Math.max(0, lastRequest + settings.delay - now);
  
  if (timeToWait > 0) {
    logger.info('Rate limit wait', { domain, timeToWait });
    await wait(timeToWait);
  }
  
  lastRequestTime.set(domain, Date.now());
};

/**
 * Get headers for a specific domain
 * @param {string} domain - Domain name
 * @returns {Object} - Headers object
 */
const getHeaders = (domain) => {
  // Add domain-specific headers if needed
  return {
    ...BROWSER_HEADERS,
    'Host': domain,
    'Referer': `https://${domain}/`,
  };
};

/**
 * Format error message for logging
 * @param {Error} error - Error object
 * @returns {string} - Formatted error message
 */
const formatError = (error) => {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    return `Server responded with status ${error.response.status}: ${error.response.statusText}`;
  } else if (error.request) {
    // The request was made but no response was received
    return `No response received: ${error.message}`;
  } else {
    // Something happened in setting up the request that triggered an Error
    return `Request setup error: ${error.message}`;
  }
};

/**
 * Fetch RSS XML from either a remote URL or a downloadable file.
 * @param {string} location - URL to the RSS feed
 * @param {Object} options - Optional settings
 * @param {boolean} options.isDownloadable - If true, downloads file first
 * @returns {Promise<string>} - Raw XML content
 */
async function fetchXML(location, options = {}) {
  const { isDownloadable = false } = options;
  let lastError;
  const domain = getDomain(location);
  const settings = getRateLimitSettings(domain);
  const headers = getHeaders(domain);

  logger.info('Starting fetch', { location, isDownloadable });

  for (let attempt = 1; attempt <= settings.maxRetries; attempt++) {
    try {
      // Wait for rate limit before making request
      await waitForRateLimit(location);

      logger.info('Fetch attempt', { 
        location, 
        attempt, 
        maxRetries: settings.maxRetries 
      });

      if (!isDownloadable) {
        const response = await axios.get(location, {
          headers,
          timeout: TIMEOUT,
          maxRedirects: 5,
          validateStatus: function (status) {
            return status >= 200 && status < 300; // Only accept 2xx status codes
          },
        });
        logger.info('Fetch successful', { 
          location, 
          contentType: response.headers['content-type'],
          contentLength: response.headers['content-length'] || 'unknown' // Log content length
        });
        return response.data;
      }

      // If isDownloadable is true, download to a temp file first
      const tmpDir = os.tmpdir();
      const tmpFilename = path.join(
        tmpDir,
        `rss-${crypto.randomUUID()}.xml`
      );

      logger.info('Downloading to temp file', { tmpFilename });

      const response = await axios.get(location, {
        responseType: 'arraybuffer',
        headers,
        timeout: TIMEOUT,
        maxRedirects: 5,
        validateStatus: function (status) {
          return status >= 200 && status < 300;
        },
      });

      await fs.writeFile(tmpFilename, response.data);
      const content = await fs.readFile(tmpFilename, 'utf8');

      // Clean up (optional)
      await fs.unlink(tmpFilename);
      logger.info('Download successful', { location });

      return content;
    } catch (err) {
      lastError = err;
      const isRateLimit = err.response?.status === 429;
      const isForbidden = err.response?.status === 403;
      const isTimeout = err.code === 'ECONNABORTED';
      
      const delay = isRateLimit ? settings.retryDelay * attempt : 
                   isForbidden ? settings.retryDelay * 2 : 
                   settings.retryDelay;

      if (attempt < settings.maxRetries) {
        logger.warn('Fetch attempt failed', {
          location,
          attempt,
          maxRetries: settings.maxRetries,
          status: isRateLimit ? 'Rate Limited (429)' : 
                 isForbidden ? 'Forbidden (403)' : 
                 isTimeout ? 'Timeout' : 
                 err.response?.status || 'Unknown',
          error: formatError(err),
          nextAttemptIn: delay
        });
        await wait(delay);
      } else {
        logger.error('All fetch attempts failed', {
          location,
          status: isRateLimit ? 'Rate Limited (429)' : 
                 isForbidden ? 'Forbidden (403)' : 
                 isTimeout ? 'Timeout' : 
                 err.response?.status || 'Unknown',
          error: formatError(err)
        });
      }
    }
  }

  // If we get here, all retries failed
  throw new Error(
    `Failed to fetch or parse remote feed after ${settings.maxRetries} attempts: ${formatError(lastError)}`
  );
}

module.exports = { fetchXML };
