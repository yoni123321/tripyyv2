const { pool } = require('../config/database');

class DatabaseService {
  // User operations
  async createUser(userData) {
    const query = `
      INSERT INTO users (email, password, name, created_at, last_login, email_verified, email_verified_at, preferences, traveler_profile, llm_config, saved_agents)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const values = [
      userData.email,
      userData.password,
      userData.name,
      userData.createdAt,
      userData.lastLogin,
      userData.emailVerified || false,
      userData.emailVerifiedAt,
      JSON.stringify(userData.preferences || {}),
      JSON.stringify(userData.travelerProfile || {}),
      JSON.stringify(userData.llmConfig || {}),
      JSON.stringify(userData.savedAgents || [])
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async getUserByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);
    return result.rows[0];
  }

  async updateUser(email, updates) {
    const query = `
      UPDATE users 
      SET last_login = $1, email_verified = $2, email_verified_at = $3, preferences = $4, traveler_profile = $5, llm_config = $6, saved_agents = $7
      WHERE email = $8
      RETURNING *
    `;
    
    const values = [
      updates.lastLogin,
      updates.emailVerified,
      updates.emailVerifiedAt,
      JSON.stringify(updates.preferences || {}),
      JSON.stringify(updates.travelerProfile || {}),
      JSON.stringify(updates.llmConfig || {}),
      JSON.stringify(updates.savedAgents || []),
      email
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Trip operations
  async createTrip(tripData) {
    const query = `
      INSERT INTO trips (user_id, name, destination, start_date, end_date, itinerary, preferences, traveler_profile, budget, tips, suggestions, is_public, share_type, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;
    
    const values = [
      tripData.userId,
      tripData.name,
      tripData.destination,
      tripData.dates?.start,
      tripData.dates?.end,
      JSON.stringify(tripData.itinerary || {}),
      JSON.stringify(tripData.preferences || {}),
      JSON.stringify(tripData.travelerProfile || {}),
      JSON.stringify(tripData.budget || {}),
      JSON.stringify(tripData.tips || []),
      JSON.stringify(tripData.suggestions || []),
      tripData.isPublic || false,
      tripData.shareType || 'private',
      tripData.createdAt,
      tripData.updatedAt
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async getUserTrips(userId) {
    const query = 'SELECT * FROM trips WHERE user_id = $1 ORDER BY updated_at DESC';
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  // POI operations
  async createPOI(poiData) {
    const query = `
      INSERT INTO pois (name, description, location, photos, created_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [
      poiData.name,
      poiData.description || '',
      JSON.stringify(poiData.coordinates),
      JSON.stringify([poiData.photo]),
      poiData.createdAt
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async getAllPOIs() {
    const query = 'SELECT * FROM pois ORDER BY created_at DESC';
    const result = await pool.query(query);
    return result.rows;
  }

  // Post operations
  async createPost(postData) {
    const query = `
      INSERT INTO posts (user_id, content, photos, created_at)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const values = [
      postData.userId,
      postData.content,
      JSON.stringify(postData.photos || []),
      postData.createdAt
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async getAllPosts() {
    const query = 'SELECT * FROM posts ORDER BY created_at DESC';
    const result = await pool.query(query);
    return result.rows;
  }
}

module.exports = new DatabaseService();