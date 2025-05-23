const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    // Create songs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS songs (
        id SERIAL PRIMARY KEY,
        suno_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        artist TEXT,
        genre TEXT,
        mood TEXT,
        description TEXT,
        tags JSONB DEFAULT '[]',
        duration INTEGER,
        play_count INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        posted_at TIMESTAMP,
        is_public BOOLEAN DEFAULT true,
        metadata JSONB DEFAULT '{}'
      )
    `);

    // Create channels table
    await client.query(`
      CREATE TABLE IF NOT EXISTS channels (
        id SERIAL PRIMARY KEY,
        discord_channel_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        message_template TEXT DEFAULT '🎵 New Suno song: {title} — {url}',
        auto_post BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create post_history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS post_history (
        id SERIAL PRIMARY KEY,
        song_id INTEGER REFERENCES songs(id),
        channel_id INTEGER REFERENCES channels(id),
        discord_message_id TEXT,
        reactions INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        posted_at TIMESTAMP DEFAULT NOW(),
        status TEXT DEFAULT 'posted'
      )
    `);

    // Create analytics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics (
        id SERIAL PRIMARY KEY,
        song_id INTEGER REFERENCES songs(id),
        event TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'
      )
    `);

    // Create scheduled_posts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_posts (
        id SERIAL PRIMARY KEY,
        song_id INTEGER REFERENCES songs(id),
        channel_id INTEGER REFERENCES channels(id),
        scheduled_for TIMESTAMP NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create playlists table
    await client.query(`
      CREATE TABLE IF NOT EXISTS playlists (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        is_public BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create playlist_songs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS playlist_songs (
        id SERIAL PRIMARY KEY,
        playlist_id INTEGER REFERENCES playlists(id),
        song_id INTEGER REFERENCES songs(id),
        "order" INTEGER DEFAULT 0,
        added_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

module.exports = { pool, initializeDatabase };