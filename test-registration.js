require('dotenv').config();
const { pool, initDatabase } = require('./src/config/database');
const dbService = require('./src/services/database-service');
const bcrypt = require('bcryptjs');

async function testRegistration() {
  console.log('🧪 Testing User Registration Process...\n');
  
  try {
    // Test 1: Check database connection
    console.log('🔗 Test 1: Database Connection');
    const dbResult = await pool.query('SELECT NOW()');
    console.log('✅ Database connected:', dbResult.rows[0].now);
    
    // Test 2: Initialize database tables
    console.log('\n🗄️ Test 2: Initialize Database Tables');
    await initDatabase();
    console.log('✅ Database tables initialized');
    
    // Test 3: Check users table structure
    console.log('\n👤 Test 3: Check Users Table Structure');
    const usersStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    console.log('✅ Users table columns:');
    usersStructure.rows.forEach(col => {
      console.log(`   ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'}) default: ${col.column_default || 'none'}`);
    });
    
    // Test 4: Check verification_tokens table
    console.log('\n🔑 Test 4: Check Verification Tokens Table');
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
    
    // Test 5: Test user creation
    console.log('\n👤 Test 5: Test User Creation');
    const testUser = {
      email: 'test@example.com',
      password: await bcrypt.hash('password123', 10),
      name: 'Test User',
      createdAt: new Date(),
      lastLogin: new Date(),
      emailVerified: false,
      emailVerifiedAt: null,
      preferences: {
        defaultCurrency: 'USD',
        language: 'en'
      },
      travelerProfile: {
        name: '',
        nickname: '',
        birthday: null,
        photo: null,
        age: 0,
        interests: [],
        dietaryRestrictions: [],
        accessibilityNeeds: [],
        numberOfTravelers: 0
      },
      llmConfig: {
        agent: 'openai',
        apiKey: '',
        model: 'gpt-3.5-turbo',
        endpoint: ''
      },
      savedAgents: [],
      friends: [],
      communities: [],
      posts: [],
      trips: [],
      likes: 0,
      lastKnownLocation: null
    };
    
    try {
      const userId = await dbService.createUser(testUser);
      console.log('✅ Test user created successfully with ID:', userId);
      
      // Test 6: Test verification token creation
      console.log('\n🔑 Test 6: Test Verification Token Creation');
      const verificationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      const tokenResult = await dbService.createVerificationToken(
        testUser.email, 
        verificationToken, 
        'email_verification', 
        expiresAt
      );
      console.log('✅ Verification token created:', tokenResult.id);
      
      // Test 7: Test user retrieval
      console.log('\n🔍 Test 7: Test User Retrieval');
      const retrievedUser = await dbService.getUserByEmail(testUser.email);
      if (retrievedUser) {
        console.log('✅ User retrieved successfully:', {
          id: retrievedUser.id,
          email: retrievedUser.email,
          name: retrievedUser.name,
          emailVerified: retrievedUser.email_verified
        });
      } else {
        console.log('❌ User retrieval failed');
      }
      
      // Clean up test data
      console.log('\n🧹 Cleaning up test data...');
      await pool.query('DELETE FROM verification_tokens WHERE email = $1', [testUser.email]);
      await pool.query('DELETE FROM users WHERE email = $1', [testUser.email]);
      console.log('✅ Test data cleaned up');
      
    } catch (userError) {
      console.error('❌ User creation failed:', userError.message);
      console.error('❌ Full error:', userError);
    }
    
    console.log('\n🎉 Registration testing completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testRegistration().catch(console.error);
}

module.exports = { testRegistration };
