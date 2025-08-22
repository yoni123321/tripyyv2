const { pool } = require('../config/database');

class DatabaseService {
  // User operations
  async createUser(userData) {
    const query = `
      INSERT INTO users (email, password, name, created_at, last_login, email_verified, email_verified_at, preferences, traveler_profile, llm_config, saved_agents, friends, communities, posts, trips, likes, last_known_location)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING id
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
      JSON.stringify(userData.savedAgents || []),
      JSON.stringify(userData.friends || []),
      JSON.stringify(userData.communities || []),
      JSON.stringify(userData.posts || []),
      JSON.stringify(userData.trips || []),
      userData.likes || 0,
      userData.lastKnownLocation ? JSON.stringify(userData.lastKnownLocation) : null
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0].id;
  }

  async getUserByEmail(email) {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await pool.query(query, [email]);
    return result.rows[0];
  }

  async getUserByName(name) {
    const query = 'SELECT * FROM users WHERE name = $1';
    const result = await pool.query(query, [name]);
    return result.rows[0];
  }

  async getUserById(userId) {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }

  async getUserCount() {
    const query = 'SELECT COUNT(*) FROM users';
    const result = await pool.query(query);
    return parseInt(result.rows[0].count);
  }

  async getPOICount() {
    const query = 'SELECT COUNT(*) FROM pois';
    const result = await pool.query(query);
    return parseInt(result.rows[0].count);
  }

  async getUserTrips(userId) {
    const query = 'SELECT * FROM trips WHERE user_id = $1 ORDER BY created_at DESC';
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  async getUserByNickname(nickname) {
    // Check if nickname exists in traveler_profile, and also check if it's not empty
    const query = `
      SELECT * FROM users 
      WHERE traveler_profile->>'nickname' = $1 
      AND traveler_profile->>'nickname' IS NOT NULL 
      AND traveler_profile->>'nickname' != ''
    `;
    const result = await pool.query(query, [nickname]);
    return result.rows[0];
  }

  async joinCommunity(userId, communityId) {
    const query = 'UPDATE communities SET members = array_append(members, $1) WHERE id = $2 RETURNING *';
    const result = await pool.query(query, [userId, communityId]);
    return result.rows[0];
  }

  async leaveCommunity(userId, communityId) {
    const query = 'UPDATE communities SET members = array_remove(members, $1) WHERE id = $2 RETURNING *';
    const result = await pool.query(query, [userId, communityId]);
    return result.rows[0];
  }

  async updateUser(email, updates) {
    console.log(`🔄 updateUser called with email: ${email}`);
    console.log(`🔄 Updates:`, JSON.stringify(updates, null, 2));
    
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
      console.log(`🔄 Setting traveler_profile to:`, JSON.stringify(updates.travelerProfile));
    }
    if (updates.llmConfig !== undefined) {
      updateFields.push(`llm_config = $${valueIndex++}`);
      values.push(JSON.stringify(updates.llmConfig));
    }
    if (updates.savedAgents !== undefined) {
      updateFields.push(`saved_agents = $${valueIndex++}`);
      values.push(JSON.stringify(updates.savedAgents));
    }
    if (updates.trips !== undefined) {
      updateFields.push(`trips = $${valueIndex++}`);
      values.push(JSON.stringify(updates.trips));
      console.log(`🔄 Setting trips to:`, JSON.stringify(updates.trips));
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
    
    console.log(`🔄 SQL Query:`, query);
    console.log(`🔄 Values:`, values);
    
    const result = await pool.query(query, values);
    console.log(`🔄 Update result:`, result.rows[0]);
    return result.rows[0];
  }

  // Trip operations
  async createTrip(tripData) {
    const query = `
      INSERT INTO trips (user_id, name, destination, start_date, end_date, itinerary, preferences, traveler_profile, budget, tips, suggestions, is_public, share_type, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `;
    
    const values = [
      tripData.userId,
      tripData.name,
      tripData.destination,
      tripData.startDate,
      tripData.endDate,
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
    return result.rows[0].id;
  }

  async createUserTrip(tripData) {
    const query = `
      INSERT INTO trips (
        user_id, name, destination, summary, is_public, share_type, 
        start_date, end_date, local_trip_id, owner_id, budget, 
        itinerary, tips, suggestions, traveler_profile, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) 
      RETURNING *
    `;
    
    const values = [
      tripData.userId,
      tripData.name,
      tripData.destination || '',
      tripData.summary || '',
      tripData.is_public || false,
      tripData.share_type || 'private',
      tripData.start_date || null,
      tripData.end_date || null,
      tripData.local_trip_id || null,
      tripData.owner_id || tripData.userId,
      JSON.stringify(tripData.budget || { total: 0, spent: 0, currency: 'USD' }),
      JSON.stringify(tripData.itinerary || []),
      JSON.stringify(tripData.tips || []),
      JSON.stringify(tripData.suggestions || []),
      JSON.stringify(tripData.traveler_profile || {}),
      new Date(),
      new Date()
    ];
    
    console.log(`🔄 Creating user trip with data:`, JSON.stringify(tripData, null, 2));
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async getUserTrips(userId) {
    // Get trips from user's trips column (JSONB array)
    const query = 'SELECT trips FROM users WHERE id = $1';
    const result = await pool.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return [];
    }
    
    const userTrips = result.rows[0].trips || [];
    
    // Sort trips by updated_at (newest first)
    return userTrips.sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at || 0);
      const dateB = new Date(b.updated_at || b.created_at || 0);
      return dateB - dateA;
    });
  }

  async getTripById(tripId) {
    const query = 'SELECT * FROM trips WHERE id = $1';
    const result = await pool.query(query, [tripId]);
    return result.rows[0];
  }

  async updateTrip(tripId, updates) {
    const updateFields = [];
    const values = [];
    let valueIndex = 1;
    
    if (updates.name !== undefined) {
      updateFields.push(`name = $${valueIndex++}`);
      values.push(updates.name);
    }
    if (updates.destination !== undefined) {
      updateFields.push(`destination = $${valueIndex++}`);
      values.push(updates.destination);
    }
    if (updates.start_date !== undefined) {
      updateFields.push(`start_date = $${valueIndex++}`);
      values.push(updates.start_date);
    }
    if (updates.end_date !== undefined) {
      updateFields.push(`end_date = $${valueIndex++}`);
      values.push(updates.end_date);
    }
    if (updates.itinerary !== undefined) {
      updateFields.push(`itinerary = $${valueIndex++}`);
      values.push(JSON.stringify(updates.itinerary));
    }
    if (updates.preferences !== undefined) {
      updateFields.push(`preferences = $${valueIndex++}`);
      values.push(JSON.stringify(updates.preferences));
    }
    if (updates.traveler_profile !== undefined) {
      updateFields.push(`traveler_profile = $${valueIndex++}`);
      values.push(JSON.stringify(updates.traveler_profile));
    }
    if (updates.budget !== undefined) {
      updateFields.push(`budget = $${valueIndex++}`);
      values.push(JSON.stringify(updates.budget));
    }
    if (updates.tips !== undefined) {
      updateFields.push(`tips = $${valueIndex++}`);
      values.push(JSON.stringify(updates.tips));
    }
    if (updates.suggestions !== undefined) {
      updateFields.push(`suggestions = $${valueIndex++}`);
      values.push(JSON.stringify(updates.suggestions));
    }
    if (updates.is_public !== undefined) {
      updateFields.push(`is_public = $${valueIndex++}`);
      values.push(updates.is_public);
    }
    if (updates.share_type !== undefined) {
      updateFields.push(`share_type = $${valueIndex++}`);
      values.push(updates.share_type);
    }
    
    // Always update the updated_at timestamp
    updateFields.push(`updated_at = $${valueIndex++}`);
    values.push(new Date());
    
    if (updateFields.length === 0) {
      throw new Error('No valid update fields provided');
    }
    
    values.push(tripId); // tripId is always the last parameter
    
    const query = `
      UPDATE trips 
      SET ${updateFields.join(', ')}
      WHERE id = $${valueIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async deleteTrip(tripId) {
    const query = 'DELETE FROM trips WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [tripId]);
    return result.rows[0];
  }

  async updateUserTrip(userId, tripId, updates) {
    // Get current user trips
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    const trips = user.trips || [];
    const tripIndex = trips.findIndex(trip => trip.id === tripId);
    
    if (tripIndex === -1) {
      throw new Error('Trip not found');
    }
    
    // Update the trip
    trips[tripIndex] = {
      ...trips[tripIndex],
      ...updates,
      updated_at: new Date().toISOString()
    };
    
    // Update user's trips column
    const updatedUser = await this.updateUser(user.email, { trips });
    return trips[tripIndex];
  }

  async deleteUserTrip(userId, tripId) {
    // Get current user trips
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    const trips = user.trips || [];
    const tripIndex = trips.findIndex(trip => trip.id === tripId);
    
    if (tripIndex === -1) {
      throw new Error('Trip not found');
    }
    
    // Remove the trip
    const deletedTrip = trips.splice(tripIndex, 1)[0];
    
    // Update user's trips column
    await this.updateUser(user.email, { trips });
    return deletedTrip;
  }

  // POI operations
  async createPOI(poiData) {
    const query = `
      INSERT INTO pois (name, description, location, photos, icon, type, author, user_id, reviews, average_rating, review_count, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `;
    
    const values = [
      poiData.name,
      poiData.description || '',
      JSON.stringify(poiData.location || {}),
      JSON.stringify(poiData.photos || []),
      poiData.icon || '',
      poiData.type || 'public',
      poiData.author || '',
      poiData.userId,
      JSON.stringify(poiData.reviews || []),
      poiData.averageRating || 0,
      poiData.reviewCount || 0,
      poiData.createdAt
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0].id;
  }

  async getAllPOIs() {
    const query = 'SELECT * FROM pois ORDER BY created_at DESC';
    const result = await pool.query(query);
    return result.rows;
  }

  async getPOIByCoordinates(lat, lng) {
    const query = 'SELECT * FROM pois WHERE location->>\'lat\' = $1 AND location->>\'lng\' = $2';
    const result = await pool.query(query, [lat.toString(), lng.toString()]);
    return result.rows[0];
  }

  async getPOIById(id) {
    const query = 'SELECT * FROM pois WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  async updatePOI(poiId, updates) {
    const updateFields = [];
    const values = [];
    let valueIndex = 1;
    
    if (updates.name !== undefined) {
      updateFields.push(`name = $${valueIndex++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      updateFields.push(`description = $${valueIndex++}`);
      values.push(updates.description);
    }
    if (updates.photos !== undefined) {
      updateFields.push(`photos = $${valueIndex++}`);
      values.push(JSON.stringify(updates.photos));
    }
    if (updates.icon !== undefined) {
      updateFields.push(`icon = $${valueIndex++}`);
      values.push(updates.icon);
    }
    if (updates.reviews !== undefined) {
      updateFields.push(`reviews = $${valueIndex++}`);
      values.push(JSON.stringify(updates.reviews));
    }
    if (updates.average_rating !== undefined) {
      updateFields.push(`average_rating = $${valueIndex++}`);
      values.push(updates.average_rating);
    }
    if (updates.review_count !== undefined) {
      updateFields.push(`review_count = $${valueIndex++}`);
      values.push(updates.review_count);
    }
    
    if (updateFields.length === 0) {
      throw new Error('No valid update fields provided');
    }
    
    values.push(poiId); // poiId is always the last parameter
    
    const query = `
      UPDATE pois 
      SET ${updateFields.join(', ')}
      WHERE id = $${valueIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async deletePOI(poiId) {
    const query = 'DELETE FROM pois WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [poiId]);
    return result.rows[0];
  }

  // Post operations
  async createPost(postData) {
    const query = `
      INSERT INTO posts (user_id, content, photos, location, connected_poi, likes, comments, like_count, comment_count, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const values = [
      postData.userId,
      postData.content,
      JSON.stringify(postData.photos || []),
      postData.location || '',
      postData.connectedPOI || '',
      JSON.stringify(postData.likes || []),
      JSON.stringify(postData.comments || []),
      postData.likes?.length || 0,
      postData.comments?.length || 0,
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

  async getPostById(postId) {
    const query = 'SELECT * FROM posts WHERE id = $1';
    const result = await pool.query(query, [postId]);
    return result.rows[0];
  }

  async updatePost(postId, updates) {
    const updateFields = [];
    const values = [];
    let valueIndex = 1;
    
    if (updates.likes !== undefined) {
      updateFields.push(`likes = $${valueIndex++}`);
      values.push(JSON.stringify(updates.likes));
    }
    if (updates.comments !== undefined) {
      updateFields.push(`comments = $${valueIndex++}`);
      values.push(JSON.stringify(updates.comments));
    }
    if (updates.like_count !== undefined) {
      updateFields.push(`like_count = $${valueIndex++}`);
      values.push(updates.like_count);
    }
    if (updates.comment_count !== undefined) {
      updateFields.push(`comment_count = $${valueIndex++}`);
      values.push(updates.comment_count);
    }
    
    if (updateFields.length === 0) {
      throw new Error('No valid update fields provided');
    }
    
    values.push(postId); // postId is always the last parameter
    
    const query = `
      UPDATE posts 
      SET ${updateFields.join(', ')}
      WHERE id = $${valueIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async deletePost(postId) {
    const query = 'DELETE FROM posts WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [postId]);
    return result.rows[0];
  }

  async deletePostsOlderThan(hours) {
    const query = `
      DELETE FROM posts 
      WHERE created_at < NOW() - INTERVAL '${hours} hours'
      RETURNING id, created_at
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  async getPostsOlderThan(hours) {
    const query = `
      SELECT id, created_at, content 
      FROM posts 
      WHERE created_at < NOW() - INTERVAL '${hours} hours'
      ORDER BY created_at ASC
    `;
    const result = await pool.query(query);
    return result.rows;
  }

  // Community operations
  async createCommunity(communityData) {
    const query = `
      INSERT INTO communities (name, description, created_by, members, created_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const values = [
      communityData.name,
      communityData.description || '',
      communityData.createdBy,
      JSON.stringify(communityData.members || []),
      communityData.createdAt
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async getAllCommunities() {
    const query = 'SELECT * FROM communities ORDER BY created_at DESC';
    const result = await pool.query(query);
    return result.rows;
  }

  async getCommunityById(communityId) {
    const query = 'SELECT * FROM communities WHERE id = $1';
    const result = await pool.query(query, [communityId]);
    return result.rows[0];
  }

  async updateCommunity(communityId, updates) {
    const updateFields = [];
    const values = [];
    let valueIndex = 1;
    
    if (updates.members !== undefined) {
      updateFields.push(`members = $${valueIndex++}`);
      values.push(JSON.stringify(updates.members));
    }
    
    if (updateFields.length === 0) {
      throw new Error('No valid update fields provided');
    }
    
    values.push(communityId); // communityId is always the last parameter
    
    const query = `
      UPDATE communities 
      SET ${updateFields.join(', ')}
      WHERE id = $${valueIndex}
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Search operations
  async searchUsers(query) {
    const searchQuery = `
      SELECT id, name, email, traveler_profile, created_at 
      FROM users 
      WHERE name ILIKE $1 OR email ILIKE $1 OR traveler_profile->>'nickname' ILIKE $1
      LIMIT 20
    `;
    const result = await pool.query(searchQuery, [`%${query}%`]);
    return result.rows;
  }

  async searchCommunities(query) {
    const searchQuery = `
      SELECT * FROM communities 
      WHERE name ILIKE $1 OR description ILIKE $1
      LIMIT 20
    `;
    const result = await pool.query(searchQuery, [`%${query}%`]);
    return result.rows;
  }
}

module.exports = new DatabaseService();