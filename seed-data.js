const { pool, initDatabase } = require('./src/config/database');
require('dotenv').config();

async function seedData() {
  try {
    console.log('🌱 Starting data seeding...');
    
    // Initialize database
    await initDatabase();
    console.log('✅ Database initialized');
    
    // Check if data already exists
    const userCheck = await pool.query('SELECT COUNT(*) FROM users');
    if (userCheck.rows[0].count > 0) {
      console.log('⚠️ Database already has data, skipping seed');
      return;
    }
    
    // Create test user
    const testUser = await pool.query(`
      INSERT INTO users (email, password, name, created_at, last_login, email_verified, email_verified_at, preferences, traveler_profile, llm_config, saved_agents, friends, communities, posts, trips, likes, last_known_location)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [
      'test@tripyy.com',
      '$2a$10$test.hash.for.testing',
      'Test User',
      new Date(),
      new Date(),
      true,
      new Date(),
      JSON.stringify({ defaultCurrency: 'USD', language: 'en' }),
      JSON.stringify({
        name: 'Test User',
        nickname: 'tester',
        birthday: null,
        photo: null,
        age: 25,
        interests: ['travel', 'photography'],
        dietaryRestrictions: [],
        accessibilityNeeds: [],
        numberOfTravelers: 1
      }),
      JSON.stringify({
        agent: 'openai',
        apiKey: '',
        model: 'gpt-3.5-turbo',
        endpoint: ''
      }),
      [],
      [],
      [],
      [],
      [],
      0,
      null
    ]);
    
    console.log('✅ Test user created:', testUser.rows[0].email);
    
    // Create test trip
    const testTrip = await pool.query(`
      INSERT INTO trips (user_id, name, destination, start_date, end_date, itinerary, preferences, traveler_profile, budget, tips, suggestions, is_public, share_type, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      testUser.rows[0].id,
      'Test Trip to Paris',
      'Paris, France',
      new Date('2024-06-01'),
      new Date('2024-06-07'),
      JSON.stringify([
        { day: 1, activities: ['Visit Eiffel Tower', 'Walk along Seine'] },
        { day: 2, activities: ['Louvre Museum', 'Champs-Élysées'] }
      ]),
      JSON.stringify({ budget: 'medium', pace: 'relaxed' }),
      JSON.stringify({ interests: ['culture', 'food'] }),
      JSON.stringify({ total: 2000, spent: 0, currency: 'USD' }),
      JSON.stringify(['Book tickets in advance', 'Try local cuisine']),
      JSON.stringify(['Visit Montmartre', 'Take a river cruise']),
      true,
      'public',
      new Date(),
      new Date()
    ]);
    
    console.log('✅ Test trip created:', testTrip.rows[0].name);
    
    // Create test POI
    const testPOI = await pool.query(`
      INSERT INTO pois (name, description, location, photos, icon, type, author, user_id, reviews, average_rating, review_count, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      'Eiffel Tower',
      'Iconic iron lattice tower on the Champ de Mars in Paris',
      JSON.stringify({ lat: 48.8584, lng: 2.2945 }),
      JSON.stringify(['https://example.com/eiffel.jpg']),
      '🏗️',
      'public',
      'Test User',
      testUser.rows[0].id,
      JSON.stringify([
        {
          id: '1',
          rating: 5,
          text: 'Amazing view of Paris!',
          author: 'Test User',
          createdAt: new Date().toISOString(),
          likes: []
        }
      ]),
      5.0,
      1,
      new Date()
    ]);
    
    console.log('✅ Test POI created:', testPOI.rows[0].name);
    
    // Create test post
    const testPost = await pool.query(`
      INSERT INTO posts (user_id, content, photos, location, connected_poi, likes, comments, like_count, comment_count, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      testUser.rows[0].id,
      'Just arrived in Paris! The city of lights is absolutely magical. Can\'t wait to explore more!',
      JSON.stringify(['https://example.com/paris-arrival.jpg']),
      'Paris, France',
      testPOI.rows[0].id,
      JSON.stringify(['tester']),
      JSON.stringify([
        {
          id: '1',
          text: 'Welcome to Paris! Enjoy your stay!',
          userId: testUser.rows[0].id,
          userName: 'Test User',
          userNickname: 'tester',
          createdAt: new Date().toISOString(),
          likes: []
        }
      ]),
      1,
      1,
      new Date()
    ]);
    
    console.log('✅ Test post created');
    
    // Create test community
    const testCommunity = await pool.query(`
      INSERT INTO communities (name, description, created_by, members, created_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      'Paris Travelers',
      'A community for people traveling to or interested in Paris',
      testUser.rows[0].id,
      JSON.stringify([testUser.rows[0].id]),
      new Date()
    ]);
    
    console.log('✅ Test community created:', testCommunity.rows[0].name);
    
    // Update user with references
    await pool.query(`
      UPDATE users 
      SET trips = $1, posts = $2, communities = $3
      WHERE id = $4
    `, [
      JSON.stringify([{
        id: testTrip.rows[0].id,
        name: testTrip.rows[0].name,
        destination: testTrip.rows[0].destination,
        createdAt: testTrip.rows[0].created_at
      }]),
      JSON.stringify([{
        id: testPost.rows[0].id,
        content: testPost.rows[0].content,
        createdAt: testPost.rows[0].created_at
      }]),
      JSON.stringify([{
        id: testCommunity.rows[0].id,
        name: testCommunity.rows[0].name,
        createdAt: testCommunity.rows[0].created_at
      }]),
      testUser.rows[0].id
    ]);
    
    console.log('✅ User updated with references');
    
    console.log('🎉 Data seeding completed successfully!');
    console.log('📊 Created:');
    console.log('   👤 1 test user (test@tripyy.com)');
    console.log('   ✈️ 1 test trip (Paris)');
    console.log('   📍 1 test POI (Eiffel Tower)');
    console.log('   📝 1 test post');
    console.log('   🏘️ 1 test community');
    
  } catch (error) {
    console.error('❌ Data seeding failed:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  seedData();
}

module.exports = { seedData };
