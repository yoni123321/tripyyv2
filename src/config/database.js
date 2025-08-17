const { Pool } = require('pg');

// Railway automatically provides DATABASE_URL environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database tables
const initDatabase = async () => {
  try {
    // Users table with all needed fields
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        email_verified BOOLEAN DEFAULT FALSE,
        email_verified_at TIMESTAMP,
        preferences JSONB DEFAULT '{}',
        traveler_profile JSONB DEFAULT '{}',
        llm_config JSONB DEFAULT '{}',
        saved_agents JSONB DEFAULT '[]',
        friends JSONB DEFAULT '[]',
        likes INTEGER DEFAULT 0,
        posts JSONB DEFAULT '[]',
        communities JSONB DEFAULT '[]'
      )
    `);

    // Trips table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trips (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        destination VARCHAR(255),
        start_date DATE,
        end_date DATE,
        itinerary JSONB DEFAULT '{}',
        preferences JSONB DEFAULT '{}',
        traveler_profile JSONB DEFAULT '{}',
        budget JSONB DEFAULT '{}',
        tips JSONB DEFAULT '[]',
        suggestions JSONB DEFAULT '[]',
        is_public BOOLEAN DEFAULT FALSE,
        share_type VARCHAR(50) DEFAULT 'private',
        share_id VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // POIs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pois (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        location JSONB NOT NULL,
        photos JSONB DEFAULT '[]',
        icon VARCHAR(10),
        type VARCHAR(50) DEFAULT 'public',
        author VARCHAR(255),
        user_id INTEGER REFERENCES users(id),
        reviews JSONB DEFAULT '[]',
        average_rating DECIMAL(3,2),
        review_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Posts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        content TEXT NOT NULL,
        photos JSONB DEFAULT '[]',
        location TEXT,
        connected_poi TEXT,
        likes JSONB DEFAULT '[]',
        comments JSONB DEFAULT '[]',
        like_count INTEGER DEFAULT 0,
        comment_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Communities table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS communities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_by INTEGER REFERENCES users(id),
        members JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
};

// Test database connection
const testConnection = async () => {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
};

module.exports = { pool, initDatabase, testConnection };