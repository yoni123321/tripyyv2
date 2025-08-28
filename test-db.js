const { pool, initDatabase, testConnection } = require('./src/config/database');
const dbService = require('./src/services/database-service');

async function testDatabase() {
  console.log('🧪 Testing Database Connection and Schema...\n');
  
  try {
    // Test 1: Basic connection
    console.log('🔗 Test 1: Basic Database Connection');
    const connectionResult = await testConnection();
    console.log('✅ Connection result:', connectionResult);
    
    // Test 2: Initialize database tables
    console.log('\n🗄️ Test 2: Initialize Database Tables');
    await initDatabase();
    console.log('✅ Database tables initialized');
    
    // Test 3: Check if tables exist
    console.log('\n📊 Test 3: Check Table Existence');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('✅ Tables found:', tablesResult.rows.map(r => r.table_name));
    
    // Test 4: Check users table structure
    console.log('\n👤 Test 4: Check Users Table Structure');
    const usersStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    console.log('✅ Users table columns:');
    usersStructure.rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
    });
    
    // Test 5: Check if verification_tokens table exists
    console.log('\n🔑 Test 5: Check Verification Tokens Table');
    const tokensStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'verification_tokens'
      ORDER BY ordinal_position
    `);
    if (tokensStructure.rows.length > 0) {
      console.log('✅ Verification tokens table columns:');
      tokensStructure.rows.forEach(col => {
        console.log(`   ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
      });
    } else {
      console.log('❌ Verification tokens table not found');
    }
    
    // Test 6: Try to create a test user
    console.log('\n👤 Test 6: Test User Creation');
    try {
      const testUser = {
        email: 'test@example.com',
        password: 'hashedpassword',
        name: 'Test User',
        createdAt: new Date(),
        lastLogin: new Date(),
        emailVerified: false,
        emailVerifiedAt: null,
        preferences: {},
        travelerProfile: {},
        llmConfig: {},
        savedAgents: [],
        friends: [],
        communities: [],
        posts: [],
        trips: [],
        likes: 0,
        lastKnownLocation: null
      };
      
      const userId = await dbService.createUser(testUser);
      console.log('✅ Test user created successfully with ID:', userId);
      
      // Clean up test user
      await pool.query('DELETE FROM users WHERE email = $1', ['test@example.com']);
      console.log('🧹 Test user cleaned up');
      
    } catch (userError) {
      console.error('❌ User creation failed:', userError.message);
    }
    
    console.log('\n🎉 Database testing completed!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
  } finally {
    await pool.end();
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testDatabase().catch(console.error);
}

module.exports = { testDatabase };
