const fs = require('fs');
const path = require('path');
const { pool, initDatabase } = require('./src/config/database');
require('dotenv').config();

async function migrateData() {
  try {
    console.log('🚀 Starting data migration...');
    
    // Initialize database
    await initDatabase();
    
    // Load existing data
    const dataFile = path.join(__dirname, 'data', 'data.json');
    if (!fs.existsSync(dataFile)) {
      console.log('❌ No data file found to migrate');
      return;
    }
    
    const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    console.log(`�� Found data: ${data.users?.length || 0} users, ${data.trips?.length || 0} trips, ${data.pois?.length || 0} POIs`);
    
    // Migrate users
    if (data.users && data.users.length > 0) {
      console.log('�� Migrating users...');
      for (const [email, user] of data.users) {
        try {
          const query = `
            INSERT INTO users (email, password, name, created_at, last_login, email_verified, email_verified_at, preferences, traveler_profile, llm_config, saved_agents, friends, likes, posts, communities)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (email) DO UPDATE SET
              last_login = EXCLUDED.last_login,
              email_verified = EXCLUDED.email_verified,
              email_verified_at = EXCLUDED.email_verified_at,
              preferences = EXCLUDED.preferences,
              traveler_profile = EXCLUDED.traveler_profile,
              llm_config = EXCLUDED.llm_config,
              saved_agents = EXCLUDED.saved_agents,
              friends = EXCLUDED.friends,
              likes = EXCLUDED.likes,
              posts = EXCLUDED.posts,
              communities = EXCLUDED.communities
          `;
          
          const values = [
            email,
            user.password,
            user.name,
            user.createdAt,
            user.lastLogin,
            user.emailVerified || false,
            user.emailVerifiedAt,
            JSON.stringify(user.preferences || {}),
            JSON.stringify(user.travelerProfile || {}),
            JSON.stringify(user.llmConfig || {}),
            JSON.stringify(user.savedAgents || []),
            JSON.stringify(user.friends || []),
            user.likes || 0,
            JSON.stringify(user.posts || []),
            JSON.stringify(user.communities || [])
          ];
          
          await pool.query(query, values);
          console.log(`✅ Migrated user: ${email}`);
        } catch (error) {
          console.error(`❌ Failed to migrate user ${email}:`, error.message);
        }
      }
    }
    
    // Migrate trips
    if (data.trips && data.trips.length > 0) {
      console.log('✈️ Migrating trips...');
      for (const [tripId, trip] of data.trips) {
        try {
          const query = `
            INSERT INTO trips (id, user_id, name, destination, start_date, end_date, itinerary, preferences, traveler_profile, budget, tips, suggestions, share_type, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              destination = EXCLUDED.destination,
              start_date = EXCLUDED.start_date,
              end_date = EXCLUDED.end_date,
              itinerary = EXCLUDED.itinerary,
              preferences = EXCLUDED.preferences,
              traveler_profile = EXCLUDED.traveler_profile,
              budget = EXCLUDED.budget,
              tips = EXCLUDED.tips,
              suggestions = EXCLUDED.suggestions,
              
              share_type = EXCLUDED.share_type,
              updated_at = EXCLUDED.updated_at
          `;
          
          const values = [
            trip.id,
            trip.userId,
            trip.name,
            trip.destination,
            trip.dates?.start,
            trip.dates?.end,
            JSON.stringify(trip.itinerary || {}),
            JSON.stringify(trip.preferences || {}),
            JSON.stringify(trip.travelerProfile || {}),
            JSON.stringify(trip.budget || {}),
            JSON.stringify(trip.tips || []),
            JSON.stringify(trip.suggestions || []),
            trip.isPublic || false,
            trip.shareType || 'private',
            trip.createdAt,
            trip.updatedAt
          ];
          
          await pool.query(query, values);
          console.log(`✅ Migrated trip: ${trip.name}`);
        } catch (error) {
          console.error(`❌ Failed to migrate trip ${trip.id}:`, error.message);
        }
      }
    }
    
    // Migrate POIs
    if (data.pois && data.pois.length > 0) {
      console.log('📍 Migrating POIs...');
      for (const poi of data.pois) {
        try {
          const query = `
            INSERT INTO pois (name, description, location, photos, icon, type, author, user_id, reviews, average_rating, review_count, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `;
          
          const values = [
            poi.name,
            poi.description || '',
            JSON.stringify(poi.coordinates),
            JSON.stringify([poi.photo]),
            poi.icon || '',
            poi.type || 'public',
            poi.author || '',
            poi.user?.id,
            JSON.stringify(poi.reviews || []),
            poi.averageRating || 0,
            poi.reviewCount || 0,
            poi.createdAt
          ];
          
          await pool.query(query, values);
          console.log(`✅ Migrated POI: ${poi.name}`);
        } catch (error) {
          console.error(`❌ Failed to migrate POI ${poi.name}:`, error.message);
        }
      }
    }
    
    console.log('🎉 Data migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.end();
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateData();
}

module.exports = { migrateData };