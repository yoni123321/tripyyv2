const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function migrateIdColumn() {
  try {
    console.log('🔄 Starting ID column migration...');
    
    // Check current table structure
    const tableInfo = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'id'
    `);
    
    console.log('📊 Current ID column info:', tableInfo.rows[0]);
    
    if (tableInfo.rows[0]?.data_type === 'integer') {
      console.log('🔧 Converting ID column from INTEGER to VARCHAR...');
      
      // Create a temporary table with the new structure
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
      
      // Drop old table and rename new one
      await pool.query('DROP TABLE users');
      await pool.query('ALTER TABLE users_new RENAME TO users');
      
      console.log('✅ ID column migration completed successfully!');
    } else {
      console.log('ℹ️ ID column is already VARCHAR, no migration needed');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.end();
  }
}

migrateIdColumn();
