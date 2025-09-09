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

// Migrate existing database structure if needed
const migrateDatabase = async () => {
  try {
    console.log('🔄 Checking if database migration is needed...');
    
    // Check current users table structure
    const tableInfo = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'id'
    `);
    
    if (tableInfo.rows[0]?.data_type === 'integer') {
      console.log('🔧 Migrating users table ID column from INTEGER to VARCHAR...');
      
      // Drop any existing users_new table from failed migrations
      try {
        await pool.query('DROP TABLE IF EXISTS users_new CASCADE');
        console.log('🧹 Cleaned up any existing users_new table');
      } catch (cleanupError) {
        console.log('ℹ️ No existing users_new table to clean up');
      }
      
      // Create new table with correct structure
      await pool.query(`
        CREATE TABLE users_new (
          id VARCHAR(255) PRIMARY KEY,
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
      
      // Copy data from old table to new table
      console.log('📋 Copying data from old table to new table...');
      await pool.query(`
        INSERT INTO users_new 
        SELECT 
          id::VARCHAR(255),
          email,
          password,
          name,
          created_at,
          last_login,
          email_verified,
          email_verified_at,
          preferences,
          traveler_profile,
          llm_config,
          saved_agents,
          friends,
          likes,
          posts,
          communities,
          trips,
          last_known_location
        FROM users
      `);
      
      console.log('🔄 Replacing old table with new structure...');
      
      // Drop foreign key constraints first
      console.log('🔗 Dropping foreign key constraints...');
      await pool.query('ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_user_id_fkey');
      await pool.query('ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_owner_id_fkey');
      await pool.query('ALTER TABLE pois DROP CONSTRAINT IF EXISTS pois_user_id_fkey');
      await pool.query('ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_user_id_fkey');
      await pool.query('ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_created_by_fkey');
      
      // Drop old table and rename new one
      await pool.query('DROP TABLE users');
      await pool.query('ALTER TABLE users_new RENAME TO users');
      
      // Recreate foreign key constraints with new ID type
      console.log('🔗 Recreating foreign key constraints...');
      await pool.query('ALTER TABLE trips ADD CONSTRAINT trips_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)');
      await pool.query('ALTER TABLE trips ADD CONSTRAINT trips_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id)');
      await pool.query('ALTER TABLE pois ADD CONSTRAINT pois_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)');
      await pool.query('ALTER TABLE posts ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)');
      await pool.query('ALTER TABLE communities ADD CONSTRAINT communities_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id)');
      
      console.log('✅ Database migration completed successfully!');
    } else {
      console.log('ℹ️ No database migration needed');
    }
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    throw error;
  }
};

// Initialize database tables
const initDatabase = async () => {
  try {
    console.log('🗄️ Initializing database tables...');
    console.log('🔗 Database URL:', process.env.DATABASE_URL ? 'Set' : 'Missing');
    console.log('🌍 Environment:', process.env.NODE_ENV || 'development');
    
    // Users table with all needed fields
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
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
        last_known_location JSONB,
        account_type VARCHAR(50) DEFAULT 'traveler'
      )
    `);

    // Trips table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trips (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(id),
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
        owner_id VARCHAR(255) REFERENCES users(id),
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
        user_id VARCHAR(255) REFERENCES users(id),
        reviews JSONB DEFAULT '[]',
        average_rating DECIMAL(3,2),
        review_count INTEGER DEFAULT 0,
        likes JSONB DEFAULT '[]',
        like_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Posts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(id),
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
    
    // Ensure posts table user_id column is VARCHAR (migration for existing tables)
    try {
      await pool.query(`
        ALTER TABLE posts 
        ALTER COLUMN user_id TYPE VARCHAR(255)
      `);
      console.log('✅ Posts table user_id column verified as VARCHAR');
    } catch (error) {
      // Column might already be VARCHAR or table might not exist yet
      console.log('ℹ️ Posts table user_id column type check:', error.message);
    }

    // Ensure pois table user_id column is VARCHAR (migration for existing tables)
    try {
      await pool.query(`
        ALTER TABLE pois 
        ALTER COLUMN user_id TYPE VARCHAR(255)
      `);
      console.log('✅ POIs table user_id column verified as VARCHAR');
    } catch (error) {
      // Column might already be VARCHAR or table might not exist yet
      console.log('ℹ️ POIs table user_id column type check:', error.message);
    }

    // Add likes fields to POIs table (migration for existing tables)
    try {
      await pool.query(`
        ALTER TABLE pois 
        ADD COLUMN IF NOT EXISTS likes JSONB DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0
      `);
      console.log('✅ POIs table likes fields added');
    } catch (error) {
      console.log('ℹ️ POIs table likes fields migration:', error.message);
    }

    // Migrate existing reviews to include likeCount field
    try {
      console.log('🔄 Migrating existing reviews to include likeCount...');
      const pois = await pool.query('SELECT id, reviews FROM pois WHERE reviews IS NOT NULL');
      
      for (const poi of pois.rows) {
        if (poi.reviews) {
          const reviews = JSON.parse(poi.reviews);
          let needsUpdate = false;
          
          const updatedReviews = reviews.map(review => {
            if (review.likeCount === undefined) {
              needsUpdate = true;
              return {
                ...review,
                likeCount: review.likes ? review.likes.length : 0
              };
            }
            return review;
          });
          
          if (needsUpdate) {
            await pool.query(
              'UPDATE pois SET reviews = $1 WHERE id = $2',
              [JSON.stringify(updatedReviews), poi.id]
            );
          }
        }
      }
      console.log('✅ Existing reviews migrated with likeCount field');
    } catch (error) {
      console.log('ℹ️ Review migration:', error.message);
    }

    // Communities table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS communities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_by VARCHAR(255) REFERENCES users(id),
        members JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Verification tokens table for email verification and password reset
    await pool.query(`
      CREATE TABLE IF NOT EXISTS verification_tokens (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        token VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN ('email_verification', 'password_reset')),
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // LLM usage tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS llm_usage (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        account_type VARCHAR(50) DEFAULT 'traveler',
        requests_used INTEGER DEFAULT 0,
        month_year VARCHAR(7) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add unique constraint for user/month combination
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_usage_user_month 
      ON llm_usage(user_id, month_year)
    `);

    // Reports table for content moderation
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        reporter_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('poi', 'post', 'comment', 'group')),
        target_id VARCHAR(255) NOT NULL,
        target_name VARCHAR(255),
        target_content TEXT,
        target_author JSONB,
        issue_type VARCHAR(50) NOT NULL CHECK (issue_type IN (
          'spam', 'harassment', 'inappropriate_content', 'fake_information', 
          'copyright_violation', 'hate_speech', 'violence', 'other'
        )),
        description TEXT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
        admin_notes TEXT,
        reviewed_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Admins table for user roles and permissions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) DEFAULT 'moderator' CHECK (role IN ('moderator', 'admin', 'super_admin')),
        permissions JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        assigned_by VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for reports table
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at)
    `);

    // Create indexes for admins table
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_admins_user_id ON admins(user_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_admins_role ON admins(role)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_admins_active ON admins(is_active)
    `);

    console.log('✅ Database tables initialized successfully');
    
    // Run migration if needed
    await migrateDatabase();
    
    // Add missing columns to existing tables if they don't exist
    await addMissingColumns();
    
    // Add new report fields if they don't exist
    await addReportFields();
    
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

// Function to add new report fields
const addReportFields = async () => {
  try {
    console.log('🔄 Adding new report fields...');
    
    // Add new report fields with IF NOT EXISTS
    await pool.query(`
      ALTER TABLE reports 
      ADD COLUMN IF NOT EXISTS target_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS target_content TEXT,
      ADD COLUMN IF NOT EXISTS target_author JSONB,
      ADD COLUMN IF NOT EXISTS reporter_nickname VARCHAR(255)
    `);
    console.log('✅ Added new report fields to reports table');
    
    // Add index for reporter_nickname
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_reports_reporter_nickname 
      ON reports(reporter_nickname)
    `);
    console.log('✅ Added reporter_nickname index to reports table');
    
    console.log('✅ Report fields migration completed');
  } catch (error) {
    console.error('❌ Error adding report fields:', error);
  }
};

module.exports = { pool, initDatabase, testConnection };