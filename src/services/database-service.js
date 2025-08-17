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

  async getUserById(userId) {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }

  async updateUser(email, updates) {
    // Build dynamic update query based on what's provided
    const updateFields = [];
    const values = [];
    let valueIndex = 1;
    
    if (updates.lastLogin !== undefined) {
      updateFields.push(`last_login = $${valueIndex++}`);
      values.push(updates.lastLogin);
    }
    if (updates.emailVerified !== undefined) {
      updateFields.push(`email_verified = $${valueIndex++}`);
      values.push(updates.emailVerified);
    }
    if (updates.emailVerifiedAt !== undefined) {
      updateFields.push(`email_verified_at = $${valueIndex++}`);
      values.push(updates.emailVerifiedAt);
    }
    if (updates.preferences !== undefined) {
      updateFields.push(`preferences = $${valueIndex++}`);
      values.push(JSON.stringify(updates.preferences));
    }
    if (updates.travelerProfile !== undefined) {
      updateFields.push(`traveler_profile = $${valueIndex++}`);
      values.push(JSON.stringify(updates.travelerProfile));
    }
    if (updates.llmConfig !== undefined) {
      updateFields.push(`llm_config = $${valueIndex++}`);
      values.push(JSON.stringify(updates.llmConfig));
    }
    if (updates.savedAgents !== undefined) {
      updateFields.push(`saved_agents = $${valueIndex++}`);
      values.push(JSON.stringify(updates.savedAgents));
    }
    
    if (updateFields.length === 0) {
      throw new Error('No valid update fields provided');
    }
    
    values.push(email); // email is always the last parameter
    
    const query = `
      UPDATE users 
      SET ${updateFields.join(', ')}
      WHERE email = $${valueIndex}
      RETURNING *
    `;
    
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