const express = require('express');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const { pool, initDatabase, testConnection } = require('./src/config/database');
const dbService = require('./src/services/database-service');
// Email verification tokens (temporary in-memory storage)
let emailVerificationTokens = new Map();
async function initializeServer() {
  try {
    console.log('🚀 Starting Tripyy Backend Server...');
    console.log('🔧 Environment:', process.env.NODE_ENV || 'development');
    console.log('🔗 Database URL:', process.env.DATABASE_URL ? 'Configured' : 'Missing');
    
    // Test database connection
    const isConnected = await testConnection();
    if (!isConnected) {
      console.error('❌ Cannot start server without database connection');
      console.error('💡 Make sure DATABASE_URL is set in Railway environment variables');
      console.error('💡 Check that PostgreSQL service is running and connected');
      process.exit(1);
    }
    
    // Initialize database tables
    await initDatabase();
    console.log('✅ Database initialized successfully');
    
    // Start server
    startServer();
  } catch (error) {
    console.error('❌ Server initialization failed:', error);
    console.error('💡 Check Railway logs for more details');
    process.exit(1);
  }
}

// Database operations are now handled by dbService

// Initialize server with database
initializeServer();

// Database cleanup will be handled by database service

// Middleware
app.use(cors({
  origin: true, // Allow all origins for network testing
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
// Serve local uploads for any non-Cloudinary photos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Cloudinary configuration
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  console.log('☁️  Cloudinary configured');
} else {
  console.log('⚠️  Cloudinary env vars not fully set; image upload will fail until configured');
}

// Multer in-memory storage for file uploads
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set in environment variables');
  process.exit(1);
}

// Helper function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

// Helper function to verify JWT token
const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Enhanced logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`📡 [${timestamp}] ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`   📝 Request body:`, JSON.stringify(req.body, null, 2));
  }
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('🏥 Health check requested');
  res.json({
    status: 'ok',
    message: 'Tripyy Backend is running',
    timestamp: new Date().toISOString(),
    database: 'Connected',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Authentication endpoints - TEMPORARILY DISABLED FOR MIGRATION
app.post('/api/auth/register', async (req, res) => {
  res.status(503).json({ error: 'Registration temporarily disabled during database migration' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Validate name
    if (name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters long' });
    }

    // Check if user already exists using database
    const existingUser = await dbService.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = Date.now().toString();
    const user = {
      id: userId,
      email,
      password: hashedPassword,
      name,
      createdAt: new Date(),
      lastLogin: new Date(),
      emailVerified: false, // New users need email verification
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
      savedAgents: []
    };

    // Save user to database
    const savedUser = await dbService.createUser(user);

    // Generate token
    const token = generateToken(userId);

    console.log(`✅ User registered successfully: ${email}`);
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Find user in database
    const user = await dbService.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if email is verified (except for dev user)
    if (email !== 'dev@tripyy.com' && !user.emailVerified) {
      return res.status(401).json({ 
        error: 'Please verify your email address before logging in',
        needsVerification: true 
      });
    }

    // Update last login in database
    await dbService.updateUser(email, { lastLogin: new Date() });

    // Generate token
    const token = generateToken(user.id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Email verification endpoints
app.post('/api/auth/send-verification', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    // Check if user exists in database
    const user = await dbService.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate verification token
    const verificationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    // Store verification token in database (temporary in-memory for now)
    emailVerificationTokens.set(email, {
      token: verificationToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });

    // In a real app, you would send an email here
    // For now, we'll just log it and return success
    console.log(`📧 Verification email would be sent to: ${email}`);
    console.log(`🔑 Verification token: ${verificationToken}`);

    res.json({ 
      message: 'Verification email sent successfully',
      token: verificationToken // In production, don't return the token
    });
  } catch (error) {
    console.error('Send verification error:', error);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

app.post('/api/auth/verify-email', async (req, res) => {
  try {
    const { email, token } = req.body;
    
    if (!email || !token) {
      return res.status(400).json({ error: 'Email and verification token are required' });
    }

    // Check if verification token exists and is valid
    const verificationData = emailVerificationTokens.get(email);
    if (!verificationData || verificationData.token !== token) {
      return res.status(400).json({ error: 'Invalid verification token' });
    }

    // Check if token is expired
    if (new Date() > verificationData.expiresAt) {
      emailVerificationTokens.delete(email);
      return res.status(400).json({ error: 'Verification token has expired' });
    }

    // Find user and mark as verified in database
    const user = await dbService.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user verification status in database
    await dbService.updateUser(email, {
      emailVerified: true,
      emailVerifiedAt: new Date()
    });
    
    // Remove verification token
    emailVerificationTokens.delete(email);

    console.log(`✅ Email verified for user: ${email}`);

    res.json({ 
      message: 'Email verified successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified
      }
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Email verification failed' });
  }
});

// User profile endpoints
app.get('/api/user/traveler-profile', authenticateUser, async (req, res) => {
  try {
    console.log(`👤 Getting traveler profile for user: ${req.userId}`);
    
    // Get user from database by ID
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      console.log(`❌ User not found: ${req.userId}`);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ Found user: ${user.email}`);
    console.log(`📝 Current profile:`, JSON.stringify(user.travelerProfile, null, 2));
    
    res.json({ travelerProfile: user.travelerProfile });
  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

app.put('/api/user/traveler-profile', authenticateUser, async (req, res) => {
  try {
    const { travelerProfile } = req.body;
    console.log(`💾 Updating traveler profile for user: ${req.userId}`);
    console.log(`📝 New profile data:`, JSON.stringify(travelerProfile, null, 2));
    
    // Get user from database by ID
    const user = await dbService.getUserById(req.userId);
    
    if (!user) {
      console.log(`❌ User not found: ${req.userId}`);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ Found user: ${user.email}`);
    console.log(`📝 Previous profile:`, JSON.stringify(user.travelerProfile, null, 2));
    
    // Update user profile in database
    await dbService.updateUser(user.email, {
      travelerProfile: { ...user.travelerProfile, ...travelerProfile }
    });
    
    console.log(`✅ Profile updated successfully`);
    console.log(`📝 Updated profile:`, JSON.stringify(user.travelerProfile, null, 2));

    res.json({ 
      message: 'Profile updated successfully',
      travelerProfile: user.travelerProfile 
    });
  } catch (error) {
    console.error('❌ Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// User stats endpoint
app.get('/api/user/stats', authenticateUser, async (req, res) => {
  try {
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate stats from database
    const userTrips = await dbService.getUserTrips(req.userId);
    const userFriends = user.friends || [];
    const userLikes = user.likes || 0;

    res.json({ 
      data: {
        trips: userTrips.length,
        friends: userFriends.length,
        likes: userLikes
      }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Failed to get user stats' });
  }
 });

app.get('/api/user/stats/:userId', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await dbService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate stats from database
    const userTrips = await dbService.getUserTrips(userId);
    const userFriends = user.friends || [];
    const userLikes = user.likes || 0;

    res.json({ 
      data: {
        trips: userTrips.length,
        friends: userFriends.length,
        likes: userLikes
      }
    });
  } catch (error) {
    console.error('Get user stats by ID error:', error);
    res.status(500).json({ error: 'Failed to get user stats' });
  }
});

// User friends endpoint
app.get('/api/user/friends', authenticateUser, async (req, res) => {
  try {
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get full friend objects from friend IDs
    const friendsList = [];
    if (user.friends && Array.isArray(user.friends)) {
      for (const friendId of user.friends) {
        const friend = await dbService.getUserById(friendId);
        if (friend) {
          friendsList.push({
            id: friend.id,
            name: friend.name,
            email: friend.email,
            travelerProfile: friend.travelerProfile,
            lastKnownLocation: friend.lastKnownLocation
          });
        }
      }
    }
    
    console.log(`👥 Friends for user ${req.userId}:`, friendsList.map(f => f.name));
    res.json({ data: { friends: friendsList } });
  } catch (error) {
    console.error('Get user friends error:', error);
    res.status(500).json({ error: 'Failed to get user friends' });
  }
});

// LLM config endpoints
app.get('/api/user/llm-config', authenticateUser, async (req, res) => {
  try {
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      llmConfig: user.llm_config,
      savedAgents: user.saved_agents 
    });
  } catch (error) {
    console.error('Get LLM config error:', error);
    res.status(500).json({ error: 'Failed to get LLM config' });
  }
});

app.put('/api/user/llm-config', authenticateUser, async (req, res) => {
  try {
    const { llmConfig, savedAgents } = req.body;
    const user = await dbService.getUserById(req.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update user in database
    const updateData = {};
    if (llmConfig) {
      updateData.llmConfig = { ...user.llm_config, ...llmConfig };
    }
    if (savedAgents) {
      updateData.savedAgents = savedAgents;
    }

    const updatedUser = await dbService.updateUser(user.email, updateData);

    res.json({ 
      message: 'LLM config updated successfully',
      llmConfig: updatedUser.llm_config,
      savedAgents: updatedUser.saved_agents 
    });
  } catch (error) {
    console.error('Update LLM config error:', error);
    res.status(500).json({ error: 'Failed to update LLM config' });
  }
});

// Communities endpoints
app.get('/api/communities', async (req, res) => {
  try {
    // Get all communities from database
    const communities = await dbService.getAllCommunities();
    
    // Enrich communities with full user objects for members
    const enrichedCommunities = await Promise.all(communities.map(async (community) => {
      const members = [];
      if (community.members && Array.isArray(community.members)) {
        for (const memberId of community.members) {
          const member = await dbService.getUserById(memberId);
          if (member) {
            members.push({
              id: member.id,
              name: member.name,
              nickname: member.traveler_profile?.nickname,
              email: member.email,
              photo: member.traveler_profile?.photo,
              travelerProfile: member.traveler_profile
            });
          }
        }
      }
      
      return {
        ...community,
        members,
        memberCount: members.length,
      };
    }));
    
    console.log(`🏘️ Returning ${enrichedCommunities.length} communities with enriched member data`);
    res.json({ communities: enrichedCommunities });
  } catch (error) {
    console.error('Get communities error:', error);
    res.status(500).json({ error: 'Failed to get communities' });
  }
});

// Simple search endpoint for users and communities
app.get('/api/search', authenticateUser, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    if (!q || q.length < 2) {
      return res.json({ users: [], communities: [] });
    }

    // Search users and communities using database service
    const [matchedUsers, matchedCommunities] = await Promise.all([
      dbService.searchUsers(q),
      dbService.searchCommunities(q)
    ]);

    // Format user results
    const formattedUsers = matchedUsers.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      nickname: user.traveler_profile?.nickname || user.name,
      travelerProfile: user.traveler_profile,
      photo: user.traveler_profile?.photo || null,
    }));

    // Format community results
    const formattedCommunities = matchedCommunities.map(community => ({
      ...community,
      memberCount: community.members ? community.members.length : 0,
    }));

    res.json({ users: formattedUsers, communities: formattedCommunities });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search' });
  }
});

app.post('/api/communities', authenticateUser, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Community name is required' });
    }

    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const community = {
      name,
      description: description || '',
      createdBy: user.id,
      members: [user.id],
      createdAt: new Date().toISOString(),
    };

    // Store community in database
    const savedCommunity = await dbService.createCommunity(community);

    // Update user's communities list
    const userCommunities = user.communities || [];
    userCommunities.push({
      id: savedCommunity.id,
      name: savedCommunity.name,
      description: savedCommunity.description,
      creator: { id: user.id, email: user.email, name: user.name },
      members: [user.id],
      createdAt: savedCommunity.created_at,
    });

    await dbService.updateUser(user.email, { communities: userCommunities });

    console.log('🏘️ New community created:', savedCommunity);
    res.status(201).json({ message: 'Community created', community: savedCommunity });
  } catch (error) {
    console.error('❌ Error creating community:', error);
    res.status(500).json({ error: 'Failed to create community' });
  }
});

// Posts endpoints
app.get('/api/posts', async (req, res) => {
  try {
    // Get all posts from database
    const posts = await dbService.getAllPosts();
    
    // Enrich posts with user details
    const enrichedPosts = await Promise.all(posts.map(async (post) => {
      const user = await dbService.getUserById(post.user_id);
      
      // Enrich comments with user details
      let enrichedComments = [];
      if (post.comments && Array.isArray(post.comments)) {
        enrichedComments = await Promise.all(post.comments.map(async (comment) => {
          if (comment.userId) {
            const commentUser = await dbService.getUserById(comment.userId);
            return {
              ...comment,
              userName: commentUser?.name || comment.userNickname || 'Anonymous',
              userNickname: commentUser?.traveler_profile?.nickname || comment.userNickname,
              userPhoto: commentUser?.traveler_profile?.photo || comment.userPhoto,
              likes: Array.isArray(comment.likes) ? comment.likes : [],
            };
          }
          return comment;
        }));
      }
      
      return {
        ...post,
        comments: enrichedComments,
        commentCount: enrichedComments.length,
        likeCount: post.like_count || 0,
        author: user ? {
          id: user.id,
          name: user.name,
          email: user.email,
          nickname: user.traveler_profile?.nickname || user.name,
          photo: user.traveler_profile?.photo || null
        } : null
      };
    }));

    // Sort by creation date (newest first)
    enrichedPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    console.log(`📝 Returning ${enrichedPosts.length} posts`);
    res.json({ data: { posts: enrichedPosts } });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Failed to get posts' });
  }
});

// Image upload endpoint (to Cloudinary)
app.post('/api/upload', authenticateUser, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(500).json({ error: 'Cloudinary not configured' });
    }

    const folder = 'tripyy';

    cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary upload error:', error);
          return res.status(500).json({ error: 'Upload failed' });
        }
        // Return both url and public_id for future deletes
        return res.json({ url: result.secure_url, publicId: result.public_id });
      }
    ).end(req.file.buffer);
  } catch (error) {
    console.error('❌ Upload handler error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Trips endpoints
app.post('/api/trips', authenticateUser, async (req, res) => {
  try {
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const {
      name,
      destination = '',
      dates = {},
      preferences = {},
      travelerProfile = {},
      itinerary = [],
      budget = { total: 0, spent: 0, currency: 'USD' },
      tips = [],
      suggestions = [],
      isPublic = false,
      shareType = 'private'
    } = req.body || {};

    const trip = {
      userId: user.id,
      name,
      destination,
      start_date: dates?.start,
      end_date: dates?.end,
      itinerary,
      preferences,
      traveler_profile: travelerProfile,
      budget,
      tips,
      suggestions,
      is_public: isPublic,
      share_type: shareType,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Store trip in database
    const savedTrip = await dbService.createTrip(trip);

    // Update user's trips list
    const userTrips = user.trips || [];
    userTrips.push({
      id: savedTrip.id,
      name: savedTrip.name,
      destination: savedTrip.destination,
      dates: { start: savedTrip.start_date, end: savedTrip.end_date },
      itinerary: savedTrip.itinerary,
      budget: savedTrip.budget,
      tips: savedTrip.tips,
      summary: req.body.summary,
      createdAt: savedTrip.created_at,
      updatedAt: savedTrip.updated_at,
      isPublic: savedTrip.is_public,
      shareType: savedTrip.share_type,
    });

    await dbService.updateUser(user.email, { trips: userTrips });

    res.json(savedTrip);
  } catch (error) {
    console.error('Create trip error:', error);
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

app.get('/api/trips', authenticateUser, async (req, res) => {
  try {
    const userTrips = await dbService.getUserTrips(req.userId);
    res.json(userTrips);
  } catch (error) {
    console.error('Get trips error:', error);
    res.status(500).json({ error: 'Failed to get trips' });
  }
});

app.put('/api/trips/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const trip = await dbService.getTripById(id);
    if (!trip || trip.user_id !== req.userId) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const updates = { ...req.body };
    // Convert camelCase to snake_case for database
    if (updates.dates) {
      updates.start_date = updates.dates.start;
      updates.end_date = updates.dates.end;
      delete updates.dates;
    }
    if (updates.travelerProfile) {
      updates.traveler_profile = updates.travelerProfile;
      delete updates.travelerProfile;
    }
    if (updates.isPublic !== undefined) {
      updates.is_public = updates.isPublic;
      delete updates.isPublic;
    }
    if (updates.shareType) {
      updates.share_type = updates.shareType;
      delete updates.shareType;
    }

    const updated = await dbService.updateTrip(id, updates);

    // Also update on user object if present
    const user = await dbService.getUserById(req.userId);
    if (user && Array.isArray(user.trips)) {
      const idx = user.trips.findIndex(t => t.id === id);
      if (idx !== -1) {
        user.trips[idx] = {
          ...user.trips[idx],
          name: updated.name,
          destination: updated.destination,
          dates: { start: updated.start_date, end: updated.end_date },
          itinerary: updated.itinerary,
          budget: updated.budget,
          tips: updated.tips,
          updatedAt: updated.updated_at,
          isPublic: updated.is_public,
          shareType: updated.share_type,
        };
        await dbService.updateUser(user.email, { trips: user.trips });
      }
    }
    
    res.json(updated);
  } catch (error) {
    console.error('Update trip error:', error);
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

app.delete('/api/trips/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const trip = await dbService.getTripById(id);
    if (!trip || trip.user_id !== req.userId) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    await dbService.deleteTrip(id);
    
    const user = await dbService.getUserById(req.userId);
    if (user && Array.isArray(user.trips)) {
      user.trips = user.trips.filter(t => t.id !== id);
      await dbService.updateUser(user.email, { trips: user.trips });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete trip error:', error);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

app.post('/api/posts', authenticateUser, async (req, res) => {
  try {
    const { content, location, connectedPOI } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Post content is required' });
    }

    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const post = {
      userId: user.id,
      content,
      location: location || '',
      connectedPOI: connectedPOI || '',
      likes: [],
      comments: [],
      createdAt: new Date().toISOString(),
    };

    // Store post in database
    const savedPost = await dbService.createPost(post);

    // Update user's posts list
    const userPosts = user.posts || [];
    userPosts.push({
      id: savedPost.id,
      content: savedPost.content,
      location: savedPost.location,
      connectedPOI: savedPost.connected_poi,
      author: { 
        id: user.id, 
        email: user.email, 
        name: user.name,
        nickname: user.traveler_profile?.nickname || user.name,
        photo: user.traveler_profile?.photo || null
      },
      likes: 0,
      comments: [],
      createdAt: savedPost.created_at,
    });

    await dbService.updateUser(user.email, { posts: userPosts });

    console.log('📝 New post created:', savedPost);
    res.status(201).json({ message: 'Post created', post: savedPost });
  } catch (error) {
    console.error('❌ Error creating post:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Tripyy POI endpoints
app.get('/api/pois', async (req, res) => {
  try {
    const pois = await dbService.getAllPOIs();
    res.json({ pois });
  } catch (error) {
    console.error('Get POIs error:', error);
    res.status(500).json({ error: 'Failed to get POIs' });
  }
});

app.post('/api/pois', authenticateUser, async (req, res) => {
  try {
    const { name, coordinates, review, icon, description, photo, type, author } = req.body;
    if (!name || !coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
      return res.status(400).json({ error: 'Name and valid coordinates are required' });
    }
    
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const poi = {
      name,
      coordinates,
      user: { id: user.id, email: user.email, name: user.name },
      createdAt: new Date().toISOString(),
      review: review || '',
      icon: icon || '',
      description: description || '',
      photo: photo || '',
      type: type || 'public',
      author: author || user.traveler_profile?.nickname || user.name || '',
    };

    // Store POI in database
    const savedPoi = await dbService.createPOI(poi);
    
    console.log('📍 New POI added:', savedPoi);
    res.status(201).json({ message: 'POI added', poi: savedPoi });
  } catch (error) {
    console.error('❌ Error adding POI:', error);
    res.status(500).json({ error: 'Failed to add POI' });
  }
});

// Update an existing public POI (by coordinates)
app.put('/api/pois', authenticateUser, async (req, res) => {
  try {
    const { coordinates, name, icon, description, photo } = req.body;
    if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
      return res.status(400).json({ error: 'Valid coordinates are required' });
    }

    // Find POI by coordinates using database service
    const poi = await dbService.getPOIByCoordinates(coordinates.lat, coordinates.lng);
    if (!poi) {
      return res.status(404).json({ error: 'POI not found' });
    }

    // Authorization: only the creator can edit (by user id or author nickname)
    const user = await dbService.getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const isOwner = (poi.user_id && poi.user_id === user.id) || (poi.author && (poi.author === (user.traveler_profile?.nickname || user.name)));
    if (!isOwner) {
      return res.status(403).json({ error: 'Not authorized to edit this POI' });
    }

    const updates = {};
    if (typeof name === 'string') updates.name = name;
    if (typeof icon === 'string') updates.icon = icon;
    if (typeof description === 'string') updates.description = description;
    if (typeof photo === 'string') {
      // If photo is being replaced and old photo is a Cloudinary asset, attempt to delete the old one
      try {
        if (poi.photos && Array.isArray(poi.photos) && poi.photos[0] && typeof poi.photos[0] === 'string' && poi.photos[0].startsWith('https://res.cloudinary.com/')) {
          const oldPublicId = extractCloudinaryPublicId(poi.photos[0]);
          if (oldPublicId) {
            cloudinary.uploader.destroy(oldPublicId, (err, result) => {
              if (err) {
                console.warn('⚠️ Cloudinary delete (old photo) failed:', err.message || err);
              } else {
                console.log('🗑️ Cloudinary old photo deleted:', result);
              }
            });
          }
        }
      } catch (cleanupErr) {
        console.warn('⚠️ Error attempting to delete old Cloudinary image:', cleanupErr);
      }
      updates.photos = [photo]; // Store as array in database
    }

    const updatedPoi = await dbService.updatePOI(poi.id, updates);
    return res.json({ message: 'POI updated', poi: updatedPoi });
  } catch (error) {
    console.error('❌ Error updating POI:', error);
    return res.status(500).json({ error: 'Failed to update POI' });
  }
});

// Delete an existing public POI (by coordinates)
app.delete('/api/pois', authenticateUser, async (req, res) => {
  try {
    const { coordinates } = req.body || {};
    if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
      return res.status(400).json({ error: 'Valid coordinates are required' });
    }

    // Find POI by coordinates using database service
    const poi = await dbService.getPOIByCoordinates(coordinates.lat, coordinates.lng);
    if (!poi) {
      return res.status(404).json({ error: 'POI not found' });
    }

    // Authorization: only the creator can delete (by user id or author nickname)
    const user = await dbService.getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const isOwner = (poi.user_id && poi.user_id === user.id) || (poi.author && (poi.author === (user.traveler_profile?.nickname || user.name)));
    if (!isOwner) {
      return res.status(403).json({ error: 'Not authorized to delete this POI' });
    }

    // Delete POI from database
    const deleted = await dbService.deletePOI(poi.id);

    // Attempt to delete Cloudinary photo if the POI used one
    try {
      if (deleted && deleted.photos && Array.isArray(deleted.photos) && deleted.photos[0] && typeof deleted.photos[0] === 'string' && deleted.photos[0].startsWith('https://res.cloudinary.com/')) {
        const publicId = extractCloudinaryPublicId(deleted.photos[0]);
        if (publicId) {
          cloudinary.uploader.destroy(publicId, (err, result) => {
            if (err) {
              console.warn('⚠️ Cloudinary delete failed:', err.message || err);
            } else {
              console.log('🗑️ Cloudinary photo deleted:', result);
            }
          });
        }
      }
    } catch (cloudErr) {
      console.warn('⚠️ Error attempting to delete Cloudinary image:', cloudErr);
    }

    return res.json({ message: 'POI deleted', poi: deleted });
  } catch (error) {
    console.error('❌ Error deleting POI:', error);
    return res.status(500).json({ error: 'Failed to delete POI' });
  }
});

// Utility: extract Cloudinary public_id from a secure URL
function extractCloudinaryPublicId(url) {
  try {
    // Example: https://res.cloudinary.com/<cloud>/image/upload/v123456789/tripyy/abc123.jpg
    // We want: tripyy/abc123 (without extension)
    const parts = url.split('/upload/');
    if (parts.length < 2) return null;
    const afterUpload = parts[1];
    // Remove version prefix if present (v123456)
    const withoutVersion = afterUpload.replace(/^v\d+\//, '');
    // Remove file extension
    const lastDot = withoutVersion.lastIndexOf('.');
    const withoutExt = lastDot !== -1 ? withoutVersion.substring(0, lastDot) : withoutVersion;
    return withoutExt;
  } catch (e) {
    return null;
  }
}

// POI review endpoint
app.post('/api/pois/review', authenticateUser, async (req, res) => {
  try {
    const { coordinates, rating, text, author, authorPhoto, photo } = req.body;
    
    if (!coordinates || !rating || !text) {
      return res.status(400).json({ error: 'Coordinates, rating, and text are required' });
    }

    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Find existing POI at these coordinates or create a new one
    let poi = await dbService.getPOIByCoordinates(coordinates.lat, coordinates.lng);

    if (!poi) {
      // Create a new POI
      const newPoi = {
        name: 'Unknown Location',
        coordinates,
        user: { id: user.id, email: user.email, name: user.name },
        createdAt: new Date().toISOString(),
        reviews: [],
        type: 'public',
        author: user.traveler_profile?.nickname || user.name || '',
      };
      poi = await dbService.createPOI(newPoi);
    }

    // Get current reviews and add new review
    const currentReviews = poi.reviews || [];
    const newReview = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      rating,
      text: text.trim(),
      author: author || user.traveler_profile?.nickname || user.name,
      authorPhoto: authorPhoto || user.traveler_profile?.photo || null,
      photo: photo || null,
      createdAt: new Date().toISOString(),
      likes: []
    };

    currentReviews.push(newReview);
    
    // Calculate average rating
    const totalRating = currentReviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = totalRating / currentReviews.length;
    const reviewCount = currentReviews.length;
    
    // Update POI with new review
    const updatedPoi = await dbService.updatePOI(poi.id, {
      reviews: currentReviews,
      average_rating: averageRating,
      review_count: reviewCount
    });
    
    console.log(`📝 Review added to POI at ${coordinates.lat}, ${coordinates.lng} by ${newReview.author}`);
    res.json({ 
      success: true, 
      poi: updatedPoi,
      review: newReview
    });
  } catch (error) {
    console.error('❌ Error adding POI review:', error);
    res.status(500).json({ error: 'Failed to add POI review' });
  }
});

// Post like endpoint
app.post('/api/posts/:postId/like', authenticateUser, async (req, res) => {
  try {
    const { postId } = req.params;
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Find the post in database
    const foundPost = await dbService.getPostById(postId);
    if (!foundPost) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Initialize likes array if it doesn't exist
    const currentLikes = foundPost.likes || [];
    
    // Toggle like
    const userNickname = user.traveler_profile?.nickname || user.name;
    const likeIndex = currentLikes.indexOf(userNickname);
    
    if (likeIndex === -1) {
      // Add like
      currentLikes.push(userNickname);
    } else {
      // Remove like
      currentLikes.splice(likeIndex, 1);
    }

    // Update post in database
    const updatedPost = await dbService.updatePost(postId, {
      likes: currentLikes,
      like_count: currentLikes.length
    });
    
    console.log(`👍 Post ${postId} ${likeIndex === -1 ? 'liked' : 'unliked'} by ${userNickname}`);
    res.json({ 
      success: true, 
      post: updatedPost,
      liked: likeIndex === -1
    });
  } catch (error) {
    console.error('❌ Error liking post:', error);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// Post comment endpoint
app.post('/api/posts/:postId/comments', authenticateUser, async (req, res) => {
  try {
    const { postId } = req.params;
    const { comment } = req.body;
    
    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Find the post in database
    const foundPost = await dbService.getPostById(postId);
    if (!foundPost) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Initialize comments array if it doesn't exist
    const currentComments = foundPost.comments || [];

    // Add comment with rich user info
    const newComment = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      text: comment.trim(),
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userNickname: user.traveler_profile?.nickname || user.name,
      userPhoto: user.traveler_profile?.photo || null,
      likes: [],
      createdAt: new Date().toISOString()
    };

    currentComments.push(newComment);
    
    // Update post in database
    const updatedPost = await dbService.updatePost(postId, {
      comments: currentComments,
      comment_count: currentComments.length
    });
    
    console.log(`💬 Comment added to post ${postId} by ${newComment.userNickname}`);
    res.json({ 
      success: true, 
      post: updatedPost,
      comment: newComment
    });
  } catch (error) {
    console.error('❌ Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Like a specific comment on a post
app.post('/api/posts/:postId/comments/:commentId/like', authenticateUser, async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Find the post in database
    const foundPost = await dbService.getPostById(postId);
    if (!foundPost) return res.status(404).json({ error: 'Post not found' });

    // Find comment
    const comment = (foundPost.comments || []).find((c) => c.id === commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    if (!Array.isArray(comment.likes)) comment.likes = [];
    const nickname = user.traveler_profile?.nickname || user.name;
    const idx = comment.likes.indexOf(nickname);
    if (idx === -1) comment.likes.push(nickname); else comment.likes.splice(idx, 1);

    // Update post in database with updated comments
    const updatedPost = await dbService.updatePost(postId, {
      comments: foundPost.comments,
      comment_count: foundPost.comments.length
    });
    
    res.json({ success: true, post: updatedPost });
  } catch (error) {
    console.error('❌ Error liking comment:', error);
    res.status(500).json({ error: 'Failed to like comment' });
  }
});

// POI review like endpoint
app.post('/api/pois/review/like', authenticateUser, async (req, res) => {
  try {
    const { reviewId } = req.body;
    
    if (!reviewId) {
      return res.status(400).json({ error: 'Review ID is required' });
    }

    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Find the review in all POIs by searching through database
    const allPois = await dbService.getAllPOIs();
    let foundReview = null;
    let foundPoi = null;
    
    for (const poi of allPois) {
      if (poi.reviews) {
        const review = poi.reviews.find(r => r.id === reviewId);
        if (review) {
          foundReview = review;
          foundPoi = poi;
          break;
        }
      }
    }

    if (!foundReview) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Initialize likes array if it doesn't exist
    if (!foundReview.likes) {
      foundReview.likes = [];
    }

    // Toggle like
    const userNickname = user.traveler_profile?.nickname || user.name;
    const likeIndex = foundReview.likes.indexOf(userNickname);
    
    if (likeIndex === -1) {
      // Add like
      foundReview.likes.push(userNickname);
    } else {
      // Remove like
      foundReview.likes.splice(likeIndex, 1);
    }
    
    // Update POI in database
    await dbService.updatePOI(foundPoi.id, {
      reviews: foundPoi.reviews
    });
    
    console.log(`👍 Review ${reviewId} ${likeIndex === -1 ? 'liked' : 'unliked'} by ${userNickname}`);
    res.json({ 
      success: true, 
      review: foundReview,
      liked: likeIndex === -1
    });
  } catch (error) {
    console.error('❌ Error liking review:', error);
    res.status(500).json({ error: 'Failed to like review' });
  }
});

// Helper function to get full user objects from user IDs (database version)
const getFullUserObjects = async (userIds) => {
  const users = [];
  for (const userId of userIds) {
    const user = await dbService.getUserById(userId);
    if (user) {
      users.push({
        id: user.id,
        name: user.name,
        nickname: user.traveler_profile?.nickname,
        email: user.email,
        photo: user.traveler_profile?.photo,
        travelerProfile: user.traveler_profile
      });
    }
  }
  return users;
};

// Community join endpoint
app.post('/api/communities/:communityId/join', authenticateUser, async (req, res) => {
  try {
    const { communityId } = req.params;
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Find the community in database
    const foundCommunity = await dbService.getCommunityById(communityId);
    if (!foundCommunity) {
      return res.status(404).json({ error: 'Community not found' });
    }

    // Add user to community members if not already a member
    const currentMembers = foundCommunity.members || [];
    if (!currentMembers.includes(user.id)) {
      currentMembers.push(user.id);
    }
    
    // Update community in database
    const updatedCommunity = await dbService.updateCommunity(communityId, {
      members: currentMembers
    });
    
    console.log(`👥 User ${user.id} joined community ${communityId}`);
    
    // Return enriched community data with full user objects
    const enrichedCommunity = {
      ...updatedCommunity,
      members: await getFullUserObjects(currentMembers)
    };
    
    res.json({ 
      success: true, 
      community: enrichedCommunity
    });
  } catch (error) {
    console.error('❌ Error joining community:', error);
    res.status(500).json({ error: 'Failed to join community' });
  }
});

// User profile endpoint
app.get('/api/user/profile/:userId', authenticateUser, (req, res) => {
  try {
    const { userId } = req.params;
    
    // Try by ID first
    let user = Array.from(users.values()).find(u => u.id === userId);
    
    // If not found, try by nickname (strip leading @ if provided)
    if (!user) {
      const nickname = (userId || '').toString().replace(/^@/, '');
      user = Array.from(users.values()).find(u => (u.travelerProfile?.nickname || u.nickname || '').toLowerCase() === nickname.toLowerCase());
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Return user profile data (excluding sensitive information)
    const profileData = {
      id: user.id,
      name: user.name,
      nickname: user.nickname,
      email: user.email,
      photo: user.photo,
      travelerProfile: user.travelerProfile,
      createdAt: user.createdAt
    };
    
    res.json({ data: profileData });
  } catch (error) {
    console.error('❌ Error getting user profile:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// User trips endpoint
app.get('/api/user/trips/:userId', authenticateUser, (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find user by ID
    const user = Array.from(users.values()).find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's trips (shared trips) - handle case where trips don't exist
    const userTrips = user.trips || [];
    
    console.log(`📋 Getting trips for user ${userId}:`, userTrips.length, 'trips');
    
    res.json({ data: userTrips });
  } catch (error) {
    console.error('❌ Error getting user trips:', error);
    res.status(500).json({ error: 'Failed to get user trips' });
  }
});

// Community leave endpoint
app.post('/api/communities/:communityId/leave', authenticateUser, (req, res) => {
  try {
    const { communityId } = req.params;
    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Find the community
    let foundCommunity = null;
    let foundUser = null;
    
    for (const [email, userData] of users) {
      if (userData.communities) {
        const community = userData.communities.find(c => c.id === communityId);
        if (community) {
          foundCommunity = community;
          foundUser = userData;
          break;
        }
      }
    }

    if (!foundCommunity) {
      return res.status(404).json({ error: 'Community not found' });
    }

    // Remove user from community members
    const memberIndex = foundCommunity.members.indexOf(user.id);
    if (memberIndex !== -1) {
      foundCommunity.members.splice(memberIndex, 1);
    }
    
    saveData();
    
    console.log(`👥 User ${user.id} left community ${communityId}`);
    
    // Return enriched community data with full user objects
    const enrichedCommunity = {
      ...foundCommunity,
      members: getFullUserObjects(foundCommunity.members)
    };
    
    res.json({ 
      success: true, 
      community: enrichedCommunity
    });
  } catch (error) {
    console.error('❌ Error leaving community:', error);
    res.status(500).json({ error: 'Failed to leave community' });
  }
});

// Start server function
function startServer() {
  app.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const nets = os.networkInterfaces();
    let hostIp = 'localhost';
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if ((net.family === 'IPv4' || net.family === 4) && !net.internal) {
          hostIp = net.address;
          break;
        }
      }
      if (hostIp !== 'localhost') break;
    }
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`🌐 Network accessible at: http://${hostIp}:${PORT}`);
    console.log(`📡 GitHub AI: ${process.env.GITHUB_AI ? '✅' : '❌'}`);
    console.log(`🗺️ Google Maps: ${process.env.GOOGLE_MAPS ? '✅' : '❌'}`);
    console.log(`🗄️ Database: ✅ PostgreSQL (Production Ready)`);
    console.log(`🔗 CORS enabled for cross-origin requests`);
  });
} 