const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

// Auto-run pending migrations on first connection
pool.query(`
  ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS flagged_wrong BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS flag_note TEXT;
`).catch(() => { /* table may not exist yet */ });

module.exports = pool;
