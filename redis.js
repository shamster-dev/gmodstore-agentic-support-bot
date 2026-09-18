const { createClient } = require('redis');

const clientOptions = {
  // Use RESP 2 for broad compatibility with Redis versions (including Redis < 6 / Windows ports)
  RESP: process.env.REDIS_RESP ? parseInt(process.env.REDIS_RESP, 10) : 2,
};

if (process.env.REDIS_URL) {
  clientOptions.url = process.env.REDIS_URL;
} else {
  clientOptions.socket = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : 6379,
  };
  if (process.env.REDIS_PASSWORD) {
    clientOptions.password = process.env.REDIS_PASSWORD;
  }
}

const redisClient = createClient(clientOptions);

redisClient.on('error', (err) => {
  console.error('[Redis] Error:', err);
});

redisClient.on('connect', () => {
  console.log('[Redis] Connecting...');
});

redisClient.on('ready', () => {
  console.log('[Redis] Connected and ready to use');
});

redisClient.on('reconnecting', () => {
  console.log('[Redis] Reconnecting...');
});

// Auto-connect when this module is imported
const connectPromise = (async () => {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
    }
  } catch (err) {
    console.error('[Redis] Initial connection error:', err);
  }
})();

module.exports = redisClient;
module.exports.redisClient = redisClient;
module.exports.connectPromise = connectPromise;
