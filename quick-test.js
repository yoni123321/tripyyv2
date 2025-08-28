require('dotenv').config();
const { pool, testConnection } = require('./src/config/database');

async function quickTest() {
  console.log('🚀 Quick Database Connection Test\n');
  
  // Check environment variables
  console.log('🔍 Environment Variables:');
  console.log('   DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Missing');
  console.log('   JWT_SECRET:', process.env.JWT_SECRET ? '✅ Set' : '❌ Missing');
  console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
  
  if (!process.env.DATABASE_URL) {
    console.log('\n❌ DATABASE_URL is missing!');
    console.log('💡 Add this to your Railway environment variables');
    console.log('💡 Get it from your PostgreSQL service "Connect" tab');
    return;
  }
  
  try {
    // Test database connection
    console.log('\n🔗 Testing Database Connection...');
    const isConnected = await testConnection();
    
    if (isConnected) {
      console.log('✅ Database connection successful!');
      
      // Test basic query
      console.log('\n📊 Testing Basic Query...');
      const result = await pool.query('SELECT NOW() as current_time');
      console.log('✅ Query successful:', result.rows[0]);
      
      // Check if users table exists
      console.log('\n👥 Checking Users Table...');
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'users'
        );
      `);
      
      if (tableCheck.rows[0].exists) {
        console.log('✅ Users table exists');
        
        // Check user count
        const userCount = await pool.query('SELECT COUNT(*) FROM users');
        console.log(`✅ User count: ${userCount.rows[0].count}`);
      } else {
        console.log('❌ Users table does not exist');
        console.log('💡 Run the migration endpoint: POST /api/migrate');
      }
      
    } else {
      console.log('❌ Database connection failed');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await pool.end();
  }
}

quickTest().catch(console.error);
