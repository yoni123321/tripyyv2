const { pool } = require('../config/database');

class DatabaseService {
  // User operations
  async createUser(userData) {
    try {
      // First, let's check what columns actually exist in the users table
      const tableInfo = await pool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'users' AND table_schema = 'public'
        ORDER BY ordinal_position
      `);
      
      console.log(`🔍 Found ${tableInfo.rows.length} columns in users table:`, 
        tableInfo.rows.map(col => col.column_name));
      
      // Build dynamic INSERT query based on actual table structure
      const columns = tableInfo.rows.map(col => col.column_name);
      const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
      
      const query = `
        INSERT INTO users (${columns.join(', ')})
        VALUES (${placeholders})
        RETURNING id
      `;
      
      console.log(`🔧 Dynamic INSERT query:`, query);
      
      // Build values array based on actual columns
      const values = columns.map(columnName => {
        switch (columnName) {
          case 'id':
            return userData.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          case 'email':
            return userData.email;
          case 'password':
            return userData.password;
          case 'name':
            return userData.name;
          case 'created_at':
            return userData.createdAt || new Date();
          case 'last_login':
            return userData.lastLogin || new Date();
          case 'email_verified':
            return userData.emailVerified || false;
          case 'email_verified_at':
            return userData.emailVerifiedAt || null;
          case 'preferences':
            return JSON.stringify(userData.preferences || {});
          case 'traveler_profile':
            return JSON.stringify(userData.travelerProfile || {});
          case 'llm_config':
            return JSON.stringify(userData.llmConfig || {});
          case 'saved_agents':
            return JSON.stringify(userData.savedAgents || []);
          case 'friends':
            return JSON.stringify(userData.friends || []);
          case 'communities':
            return JSON.stringify(userData.communities || []);
          case 'posts':
            return JSON.stringify(userData.posts || []);
          case 'trips':
            return JSON.stringify(userData.trips || []);
          case 'likes':
            return userData.likes || 0;
          case 'last_known_location':
            return userData.lastKnownLocation ? JSON.stringify(userData.lastKnownLocation) : null;
          default:
            // For any other columns, use default value or null
            const column = tableInfo.rows.find(col => col.column_name === columnName);
            if (column.column_default) {
              return column.column_default;
            }
            if (column.is_nullable === 'YES') {
              return null;
            }
            // For required columns without defaults, provide sensible defaults
            if (column.data_type === 'jsonb') {
              return '{}';
            }
            if (column.data_type === 'integer') {
              return 0;
            }
            if (column.data_type === 'boolean') {
              return false;
            }
            return null;
        }
      });
      
      console.log(`🔧 Values array length: ${values.length}, Columns length: ${columns.length}`);
      console.log(`🔧 Values:`, values.map((v, i) => `${columns[i]}: ${typeof v === 'string' ? v.substring(0, 50) : v}`));
      
      const result = await pool.query(query, values);
      console.log(`✅ User created successfully in database: ${userData.email}`);
      return result.rows[0].id;
    } catch (error) {
      console.error(`❌ Database error creating user ${userData.email}:`, error);
      throw error;
    }
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
    if (updates.posts !== undefined) {
      updateFields.push(`posts = $${valueIndex++}`);
      values.push(JSON.stringify(updates.posts));
      console.log(`🔄 Setting posts to:`, JSON.stringify(updates.posts));
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
      INSERT INTO trips (user_id, name, destination, start_date, end_date, itinerary, preferences, traveler_profile, budget, tips, suggestions, share_type, numberOfTravelers, created_at, updated_at)
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
      tripData.shareType || 'private',
      tripData.numberOfTravelers || null,
      tripData.createdAt,
      tripData.updatedAt
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0].id;
  }

  async createUserTrip(tripData) {
    const query = `
      INSERT INTO trips (
        user_id, name, destination, summary, share_type, 
        start_date, end_date, local_trip_id, owner_id, budget, 
        itinerary, tips, suggestions, traveler_profile, numberOfTravelers, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) 
      RETURNING *
    `;
    
    const values = [
      tripData.userId,
      tripData.name,
      tripData.destination || '',
      tripData.summary || '',
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
      tripData.numberOfTravelers || null,
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

    if (updates.share_type !== undefined) {
      updateFields.push(`share_type = $${valueIndex++}`);
      values.push(updates.share_type);
    }
    
    if (updates.numberOfTravelers !== undefined) {
      updateFields.push(`numberOfTravelers = $${valueIndex++}`);
      values.push(updates.numberOfTravelers);
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
    console.log(`🔄 Database: Updating trip ${tripId} for user ${userId}`);
    console.log(`📝 Database: Update data:`, JSON.stringify(updates, null, 2));
    
    // Get current user trips
    const user = await this.getUserById(userId);
    if (!user) {
      console.log(`❌ Database: User not found: ${userId}`);
      throw new Error('User not found');
    }
    
    const trips = user.trips || [];
    const tripIndex = trips.findIndex(trip => trip.id === tripId);
    
    if (tripIndex === -1) {
      console.log(`❌ Database: Trip ${tripId} not found in user's trips`);
      throw new Error('Trip not found');
    }
    
    const originalTrip = trips[tripIndex];
    console.log(`✅ Database: Found trip "${originalTrip.name}" at index ${tripIndex}`);
    console.log(`📊 Database: Original trip data:`, JSON.stringify(originalTrip, null, 2));
    
    // Handle field mapping (frontend sends camelCase, we store as snake_case)
    const processedUpdates = { ...updates };
    if (updates.shareType !== undefined) {
      processedUpdates.share_type = updates.shareType;
      delete processedUpdates.shareType;
      console.log(`🔄 Database: Mapped shareType "${updates.shareType}" to share_type "${processedUpdates.share_type}"`);
    }
    
    // numberOfTravelers is already in the correct format, no mapping needed
    if (updates.numberOfTravelers !== undefined) {
      console.log(`🔄 Database: Updating numberOfTravelers to: ${updates.numberOfTravelers}`);
    }
    
    // Update the trip
    trips[tripIndex] = {
      ...originalTrip,
      ...processedUpdates,
      updated_at: new Date().toISOString()
    };
    
    console.log(`📝 Database: Updated trip data:`, JSON.stringify(trips[tripIndex], null, 2));
    
    // Update user's trips column
    const updatedUser = await this.updateUser(user.email, { trips });
    console.log(`✅ Database: User updated successfully, trips column now has ${updatedUser.trips?.length || 0} trips`);
    
    return trips[tripIndex];
  }

  async deleteUserTrip(userId, tripId) {
    console.log(`🗑️ Database: Deleting trip ${tripId} for user ${userId}`);
    
    // Get current user trips
    const user = await this.getUserById(userId);
    if (!user) {
      console.log(`❌ Database: User not found: ${userId}`);
      throw new Error('User not found');
    }
    
    console.log(`✅ Database: Found user ${user.email} with ${user.trips?.length || 0} trips`);
    
    const trips = user.trips || [];
    const tripIndex = trips.findIndex(trip => trip.id === tripId);
    
    if (tripIndex === -1) {
      console.log(`❌ Database: Trip ${tripId} not found in user's trips`);
      throw new Error('Trip not found');
    }
    
    console.log(`✅ Database: Found trip at index ${tripIndex}:`, trips[tripIndex].name);
    
    // Create a new array without the deleted trip (don't modify original)
    const updatedTrips = trips.filter(trip => trip.id !== tripId);
    const deletedTrip = trips[tripIndex];
    
    console.log(`🗑️ Database: Removing trip "${deletedTrip.name}" (${deletedTrip.id})`);
    console.log(`📊 Database: Trips before: ${trips.length}, after: ${updatedTrips.length}`);
    
    // Update user's trips column with the new array
    const updateResult = await this.updateUser(user.email, { trips: updatedTrips });
    console.log(`✅ Database: User updated successfully, trips column now has ${updateResult.trips?.length || 0} trips`);
    
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
      String(poiData.userId), // Ensure userId is converted to string
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

  // Verification token management
  async createVerificationToken(email, token, type, expiresAt) {
    const query = `
      INSERT INTO verification_tokens (email, token, type, expires_at)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await pool.query(query, [email, token, type, expiresAt]);
    return result.rows[0];
  }

  async getVerificationToken(email, token, type) {
    const query = `
      SELECT * FROM verification_tokens 
      WHERE email = $1 AND token = $2 AND type = $3 AND used = FALSE AND expires_at > NOW()
    `;
    const result = await pool.query(query, [email, token, type]);
    return result.rows[0];
  }

  async markVerificationTokenAsUsed(tokenId) {
    const query = `
      UPDATE verification_tokens 
      SET used = TRUE 
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [tokenId]);
    return result.rows[0];
  }

  async deleteExpiredVerificationTokens() {
    const query = `
      DELETE FROM verification_tokens 
      WHERE expires_at < NOW() OR used = TRUE
    `;
    const result = await pool.query(query);
    return result.rowCount;
  }

  async cleanupVerificationTokens() {
    // Delete tokens older than 7 days
    const query = `
      DELETE FROM verification_tokens 
      WHERE created_at < NOW() - INTERVAL '7 days'
    `;
    const result = await pool.query(query);
    return result.rowCount;
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
    try {
      console.log('🗄️ Database: Creating post with data:', JSON.stringify(postData, null, 2));
      
      // Ensure userId is always a string to prevent INTEGER overflow errors
      const userId = String(postData.userId);
      console.log('🗄️ Database: UserId type check:', typeof userId, 'Value:', userId);
      
      const query = `
        INSERT INTO posts (user_id, content, photos, location, connected_poi, likes, comments, like_count, comment_count, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `;
      
      const values = [
        userId, // Use the string version of userId
        postData.content,
        JSON.stringify(postData.photos || []),
        postData.location || '',
        JSON.stringify(postData.connectedPOI || null),
        JSON.stringify(postData.likes || []),
        JSON.stringify(postData.comments || []),
        postData.likes?.length || 0,
        postData.comments?.length || 0,
        postData.createdAt ? new Date(postData.createdAt) : new Date()
      ];
      
      console.log('🗄️ Database: Query values:', values);
      
      const result = await pool.query(query, values);
      console.log('✅ Database: Post created successfully:', result.rows[0]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Database: Error creating post:', error);
      console.error('❌ Database: Error details:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        constraint: error.constraint
      });
      throw error;
    }
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

  async getCommunityById(communityId) {
    const query = 'SELECT * FROM communities WHERE id = $1';
    const result = await pool.query(query, [communityId]);
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
    
    if (updates.connected_poi !== undefined) {
      updateFields.push(`connected_poi = $${valueIndex++}`);
      values.push(JSON.stringify(updates.connected_poi));
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

  // Report operations
  async createReport(reportData) {
    try {
      console.log('🗄️ Database: Creating report with data:', JSON.stringify(reportData, null, 2));
      
      const query = `
        INSERT INTO reports (reporter_id, target_type, target_id, target_name, target_content, target_author, issue_type, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;
      
      const values = [
        String(reportData.reporterId), // Ensure string type
        reportData.targetType,
        String(reportData.targetId), // Ensure string type
        reportData.targetName || null,
        reportData.targetContent || null,
        reportData.targetAuthor ? JSON.stringify(reportData.targetAuthor) : null,
        reportData.issueType,
        reportData.description
      ];
      
      console.log('🗄️ Database: Report query values:', values);
      
      const result = await pool.query(query, values);
      console.log('✅ Database: Report created successfully:', result.rows[0]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Database: Error creating report:', error);
      throw error;
    }
  }

  async getReports(status = 'pending', limit = 50, offset = 0) {
    try {
      const query = `
        SELECT r.*, u.name as reporter_name, u.email as reporter_email
        FROM reports r
        JOIN users u ON r.reporter_id = u.id
        WHERE r.status = $1
        ORDER BY r.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      
      const result = await pool.query(query, [status, limit, offset]);
      
      // Parse target_author JSONB field for each report
      return result.rows.map(report => ({
        ...report,
        target_author: report.target_author ? JSON.parse(report.target_author) : null
      }));
    } catch (error) {
      console.error('❌ Database: Error fetching reports:', error);
      throw error;
    }
  }

  async updateReport(reportId, updates) {
    try {
      console.log('🗄️ Database: Updating report:', reportId, updates);
      
      const updateFields = [];
      const values = [];
      let valueIndex = 1;
      
      if (updates.status !== undefined) {
        updateFields.push(`status = $${valueIndex++}`);
        values.push(updates.status);
      }
      
      if (updates.adminNotes !== undefined) {
        updateFields.push(`admin_notes = $${valueIndex++}`);
        values.push(updates.adminNotes);
      }
      
      if (updates.reviewedBy !== undefined) {
        updateFields.push(`reviewed_by = $${valueIndex++}`);
        values.push(updates.reviewedBy);
      }
      
      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }
      
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(reportId);
      
      const query = `
        UPDATE reports 
        SET ${updateFields.join(', ')}
        WHERE id = $${valueIndex}
        RETURNING *
      `;
      
      const result = await pool.query(query, values);
      console.log('✅ Database: Report updated successfully:', result.rows[0]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Database: Error updating report:', error);
      throw error;
    }
  }

  async getReportById(reportId) {
    try {
      const query = `
        SELECT r.*, u.name as reporter_name, u.email as reporter_email
        FROM reports r
        JOIN users u ON r.reporter_id = u.id
        WHERE r.id = $1
      `;
      
      const result = await pool.query(query, [reportId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      // Parse target_author JSONB field
      const report = result.rows[0];
      return {
        ...report,
        target_author: report.target_author ? JSON.parse(report.target_author) : null
      };
    } catch (error) {
      console.error('❌ Database: Error fetching report:', error);
      throw error;
    }
  }

  // Admin operations
  async createAdmin(adminData) {
    try {
      console.log('🗄️ Database: Creating admin with data:', JSON.stringify(adminData, null, 2));
      
      const query = `
        INSERT INTO admins (user_id, role, assigned_by, permissions)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (user_id) 
        DO UPDATE SET role = $2, assigned_by = $3, permissions = $4, updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;
      
      const values = [
        String(adminData.userId), // Ensure string type
        adminData.role,
        String(adminData.assignedBy), // Ensure string type
        JSON.stringify(adminData.permissions || {})
      ];
      
      console.log('🗄️ Database: Admin query values:', values);
      
      const result = await pool.query(query, values);
      console.log('✅ Database: Admin created successfully:', result.rows[0]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Database: Error creating admin:', error);
      throw error;
    }
  }

  async getAdmins() {
    try {
      const query = `
        SELECT a.*, u.name, u.email, u.created_at as user_created_at
        FROM admins a
        JOIN users u ON a.user_id = u.id
        WHERE a.is_active = true
        ORDER BY a.created_at DESC
      `;
      
      const result = await pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('❌ Database: Error fetching admins:', error);
      throw error;
    }
  }

  async getAdminByUserId(userId) {
    try {
      const query = `
        SELECT * FROM admins 
        WHERE user_id = $1 AND is_active = true
      `;
      
      const result = await pool.query(query, [String(userId)]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Database: Error fetching admin:', error);
      throw error;
    }
  }

  async updateAdmin(adminId, updates) {
    try {
      console.log('🗄️ Database: Updating admin:', adminId, updates);
      
      const updateFields = [];
      const values = [];
      let valueIndex = 1;
      
      if (updates.role !== undefined) {
        updateFields.push(`role = $${valueIndex++}`);
        values.push(updates.role);
      }
      
      if (updates.permissions !== undefined) {
        updateFields.push(`permissions = $${valueIndex++}`);
        values.push(JSON.stringify(updates.permissions));
      }
      
      if (updates.isActive !== undefined) {
        updateFields.push(`is_active = $${valueIndex++}`);
        values.push(updates.isActive);
      }
      
      if (updateFields.length === 0) {
        throw new Error('No fields to update');
      }
      
      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(adminId);
      
      const query = `
        UPDATE admins 
        SET ${updateFields.join(', ')}
        WHERE id = $${valueIndex}
        RETURNING *
      `;
      
      const result = await pool.query(query, values);
      console.log('✅ Database: Admin updated successfully:', result.rows[0]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Database: Error updating admin:', error);
      throw error;
    }
  }
}

module.exports = new DatabaseService();