const Redis = require('ioredis');

const valkey = new Redis(process.env.VALKEY_URL || 'redis://localhost:6379');

valkey.on('error', (err) => console.error('Valkey connection error:', err));
valkey.on('connect', () => console.log('Connected to Valkey'));

module.exports = valkey;
