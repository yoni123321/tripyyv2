const { pool, initDatabase } = require('./src/config/database');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function migrateToRailway() {
  try {
    console.log('🚀 Starting migration to Railway...');
    console.log('🔗 Target: Railway PostgreSQL Database');
    
    // Initialize database
    await initDatabase();
    console.log('✅ Database initialized');
    
    // Check if data already exists
    const userCheck = await pool.query('SELECT COUNT(*) FROM users');
    if (userCheck.rows[0].count > 0) {
      console.log('⚠️ Database already has data, skipping migration');
      return;
    }
    
    // Read data.json
    const dataPath = path.join(__dirname, 'data', 'data.json');
    if (!fs.existsSync(dataPath)) {
      console.error('❌ data.json not found');
      return;
    }
    
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    console.log(`📂 Found data: ${data.users?.length || 0} users, ${data.trips?.length || 0} trips, ${data.pois?.length || 0} POIs`);
    
    // Migrate users
    if (data.users && data.users.length > 0) {
      console.log('👤 Migrating users...');
      for (const [email, userData] of data.users) {
        try {
          const user = await pool.query(`
            INSERT INTO users (email, password, name, created_at, last_login, email_verified, email_verified_at, preferences, traveler_profile, llm_config, saved_agents, friends, communities, posts, trips, likes, last_known_location)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *
          `, [
            userData.email,
            userData.password,
            userData.name,
            new Date(userData.createdAt),
            new Date(userData.lastLogin),
            userData.emailVerified,
            userData.emailVerifiedAt ? new Date(userData.emailVerifiedAt) : null,
            JSON.stringify(userData.preferences || {}),
            JSON.stringify(userData.travelerProfile || {}),
            JSON.stringify(userData.llmConfig || {}),
            JSON.stringify(userData.savedAgents || []),
            JSON.stringify(userData.friends || []),
            JSON.stringify(userData.communities || []),
            JSON.stringify(userData.posts || []),
            JSON.stringify(userData.trips || []),
            userData.likes || 0,
            userData.lastKnownLocation ? JSON.stringify(userData.lastKnownLocation) : null
          ]);
          
          console.log(`✅ User migrated: ${userData.email} (ID: ${user.rows[0].id})`);
          
          // Store the mapping of old ID to new ID
          userData._newId = user.rows[0].id;
        } catch (error) {
          console.error(`❌ Failed to migrate user ${email}:`, error.message);
        }
      }
    }
    
    // Migrate trips
    if (data.trips && data.trips.length > 0) {
      console.log('✈️ Migrating trips...');
      for (const [tripId, tripData] of data.trips) {
        try {
          // Find the user who owns this trip
          const user = await pool.query('SELECT id FROM users WHERE email = $1', [tripData.user?.email || 'dev@tripyy.com']);
          if (user.rows.length === 0) {
            console.log(`⚠️ Skipping trip ${tripId} - user not found`);
            continue;
          }
          
          const trip = await pool.query(`
            INSERT INTO trips (user_id, name, destination, start_date, end_date, itinerary, preferences, traveler_profile, budget, tips, suggestions, share_type, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
          `, [
            user.rows[0].id,
            tripData.name,
            tripData.destination || '',
            tripData.dates?.start ? new Date(tripData.dates.start) : null,
            tripData.dates?.end ? new Date(tripData.dates.end) : null,
            JSON.stringify(tripData.itinerary || {}),
            JSON.stringify(tripData.preferences || {}),
            JSON.stringify(tripData.travelerProfile || {}),
            JSON.stringify(tripData.budget || {}),
            JSON.stringify(tripData.tips || []),
            JSON.stringify(tripData.suggestions || []),
            tripData.isPublic || false,
            tripData.shareType || 'private',
            new Date(tripData.createdAt),
            new Date(tripData.updatedAt)
          ]);
          
          console.log(`✅ Trip migrated: ${tripData.name} (ID: ${trip.rows[0].id})`);
          
          // Store the mapping of old ID to new ID
          tripData._newId = trip.rows[0].id;
        } catch (error) {
          console.error(`❌ Failed to migrate trip ${tripId}:`, error.message);
        }
      }
    }
    
    // Migrate POIs
    if (data.pois && data.pois.length > 0) {
      console.log('📍 Migrating POIs...');
      for (const poiData of data.pois) {
        try {
          // Find the user who created this POI
          const user = await pool.query('SELECT id FROM users WHERE email = $1', [poiData.user?.email || 'dev@tripyy.com']);
          if (user.rows.length === 0) {
            console.log(`⚠️ Skipping POI ${poiData.name} - user not found`);
            continue;
          }
          
          const poi = await pool.query(`
            INSERT INTO pois (name, description, location, photos, icon, type, author, user_id, reviews, average_rating, review_count, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *
          `, [
            poiData.name,
            poiData.description || '',
            JSON.stringify(poiData.coordinates || {}),
            JSON.stringify([poiData.photo || '']),
            poiData.icon || '',
            poiData.type || 'public',
            poiData.author || poiData.user?.name || '',
            user.rows[0].id,
            JSON.stringify(poiData.reviews || []),
            poiData.averageRating || 0,
            poiData.reviewCount || 0,
            new Date(poiData.createdAt)
          ]);
          
          console.log(`✅ POI migrated: ${poiData.name} (ID: ${poi.rows[0].id})`);
          
          // Store the mapping of old ID to new ID
          poiData._newId = poi.rows[0].id;
        } catch (error) {
          console.error(`❌ Failed to migrate POI ${poiData.name}:`, error.message);
        }
      }
    }
    
    // Migrate posts
    console.log('📝 Migrating posts...');
    for (const [email, userData] of data.users || []) {
      if (userData.posts && userData.posts.length > 0) {
        for (const postData of userData.posts) {
          try {
            const user = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
            if (user.rows.length === 0) continue;
            
            const post = await pool.query(`
              INSERT INTO posts (user_id, content, photos, location, connected_poi, likes, comments, like_count, comment_count, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              RETURNING *
            `, [
              user.rows[0].id,
              postData.content || '',
              JSON.stringify(postData.photos || []),
              postData.location || '',
              postData.connectedPOI || '',
              JSON.stringify(postData.likes || []),
              JSON.stringify(postData.comments || []),
              postData.likes?.length || 0,
              postData.comments?.length || 0,
              new Date(postData.createdAt)
            ]);
            
            console.log(`✅ Post migrated for user ${email}`);
          } catch (error) {
            console.error(`❌ Failed to migrate post for user ${email}:`, error.message);
          }
        }
      }
    }
    
    // Migrate communities
    console.log('🏘️ Migrating communities...');
    for (const [email, userData] of data.users || []) {
      if (userData.communities && userData.communities.length > 0) {
        for (const communityData of userData.communities) {
          try {
            const user = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
            if (user.rows.length === 0) continue;
            
            const community = await pool.query(`
              INSERT INTO communities (name, description, created_by, members, created_at)
              VALUES ($1, $2, $3, $4, $5)
              RETURNING *
            `, [
              communityData.name,
              communityData.description || '',
              user.rows[0].id,
              JSON.stringify(communityData.members || []),
              new Date(communityData.createdAt)
            ]);
            
            console.log(`✅ Community migrated: ${communityData.name}`);
          } catch (error) {
            console.error(`❌ Failed to migrate community ${communityData.name}:`, error.message);
          }
        }
      }
    }
    
    console.log('🎉 Migration to Railway completed successfully!');
    console.log('📊 Summary:');
    console.log(`   👤 Users: ${data.users?.length || 0}`);
    console.log(`   ✈️ Trips: ${data.trips?.length || 0}`);
    console.log(`   📍 POIs: ${data.pois?.length || 0}`);
    console.log(`   📝 Posts: Migrated from user data`);
    console.log(`   🏘️ Communities: Migrated from user data`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  migrateToRailway();
}

module.exports = { migrateToRailway };
