const { Pool } = require('pg');

// Validate and parse DATABASE_URL
const validateDatabaseUrl = (url) => {
  try {
    if (!url) {
      throw new Error('DATABASE_URL is not set');
    }
    
    // Check if it's a valid PostgreSQL URL
    if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
      throw new Error('DATABASE_URL must start with postgresql:// or postgres://');
    }
    
    // Parse the URL to validate format
    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname || !parsedUrl.port || !parsedUrl.pathname) {
      throw new Error('Invalid DATABASE_URL format');
    }
    
    console.log('✅ DATABASE_URL format is valid');
    console.log('🔗 Host:', parsedUrl.hostname);
    console.log('🔗 Port:', parsedUrl.port);
    console.log('🔗 Database:', parsedUrl.pathname.slice(1));
    
    return true;
  } catch (error) {
    console.error('❌ DATABASE_URL validation failed:', error.message);
    return false;
  }
};

// Railway automatically provides DATABASE_URL environment variable
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Add connection timeout and retry settings
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 20,
  min: 2
});

// Add error handling for the pool
pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

pool.on('connect', (client) => {
  console.log('🔗 New client connected to database');
});

pool.on('remove', (client) => {
  console.log('🔗 Client removed from database pool');
});

// Initialize database tables
const initDatabase = async () => {
  try {
    console.log('🗄️ Initializing database tables...');
    console.log('🔗 Database URL:', process.env.DATABASE_URL ? 'Set' : 'Missing');
    console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
    
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
        communities JSONB DEFAULT '[]',
        trips JSONB DEFAULT '[]',
        last_known_location JSONB
      )
    `);

    // Trips table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trips (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        destination VARCHAR(255),
        summary TEXT,
        start_date DATE,
        end_date DATE,
        itinerary JSONB DEFAULT '{}',
        preferences JSONB DEFAULT '{}',
        traveler_profile JSONB DEFAULT '{}',
        budget JSONB DEFAULT '{}',
        tips JSONB DEFAULT '[]',
        suggestions JSONB DEFAULT '[]',
        share_type VARCHAR(50) DEFAULT 'private',
        share_id VARCHAR(255) UNIQUE,
        local_trip_id VARCHAR(255),
        owner_id INTEGER REFERENCES users(id),
        numberOfTravelers INTEGER,
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
        connected_poi JSONB,
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
    
    // Add missing columns to existing tables if they don't exist
    await addMissingColumns();
    
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  }
};

// Function to add missing columns to existing tables
const addMissingColumns = async () => {
  try {
    console.log('🔧 Checking for missing columns...');
    
    // Check if trips column exists in users table
    const tripsColumnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'trips'
    `);
    
    if (tripsColumnCheck.rows.length === 0) {
      console.log('➕ Adding trips column to users table...');
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN trips JSONB DEFAULT '[]'
      `);
      console.log('✅ trips column added');
    }
    
    // Check if last_known_location column exists in users table
    const locationColumnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'last_known_location'
    `);
    
    if (locationColumnCheck.rows.length === 0) {
      console.log('➕ Adding last_known_location column to users table...');
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN last_known_location JSONB
      `);
      console.log('✅ last_known_location column added');
    }
    
    console.log('✅ All missing columns added successfully');
  } catch (error) {
    console.error('❌ Error adding missing columns:', error);
    // Don't throw error here, just log it
  }
};

// Test database connection
const testConnection = async () => {
  try {
    console.log('🔍 Testing database connection...');
    console.log('🔗 DATABASE_URL exists:', !!process.env.DATABASE_URL);
    
    if (!process.env.DATABASE_URL) {
      console.error('❌ DATABASE_URL environment variable is not set');
      return false;
    }
    
    // Debug: Show DATABASE_URL structure (mask password)
    const debugUrl = process.env.DATABASE_URL.replace(/:([^@]+)@/, ':****@');
    console.log('🔍 DATABASE_URL structure:', debugUrl);
    
    // Validate DATABASE_URL format
    if (!validateDatabaseUrl(process.env.DATABASE_URL)) {
      return false;
    }
    
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('🔍 Connection details:', {
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      nodeEnv: process.env.NODE_ENV,
      errorCode: error.code,
      errorAddress: error.address,
      errorPort: error.port,
      fullError: error.stack
    });
    return false;
  }
};

module.exports = { pool, initDatabase, testConnection };