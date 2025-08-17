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
/*
// Data storage file
const DATA_FILE = path.join(__dirname, 'data.json');

// In-memory storage for testing
let users = new Map();
let trips = new Map();
let pois = [];
let emailVerificationTokens = new Map(); // Store email verification tokens

// Load data from file on startup
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      users = new Map(data.users || []);
      trips = new Map(data.trips || []);
      pois = data.pois || [];
      console.log(`📂 Loaded data from file: ${users.size} users, ${trips.size} trips, ${pois.length} pois`);
    } else {
      console.log('📂 No existing data file found, starting with empty storage');
    }
  } catch (error) {
    console.error('❌ Error loading data:', error);
    console.log('📂 Starting with empty storage');
  }
}
*/
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

// Save data to file
function saveData() {
  try {
    const data = {
      users: Array.from(users.entries()),
      trips: Array.from(trips.entries()),
      pois,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`💾 Data saved to file: ${users.size} users, ${trips.size} trips, ${pois.length} pois`);
  } catch (error) {
    console.error('❌ Error saving data:', error);
  }
}

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
    usersCount: users.size,
    tripsCount: trips.size
  });
});

// Authentication endpoints
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

    // Check if user already exists
    if (users.has(email)) {
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

    users.set(email, user);
    
    // Save data to file
    saveData();

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

    // Find user
    const user = users.get(email);
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

    // Update last login
    user.lastLogin = new Date();

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

    // Check if user exists
    const user = users.get(email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate verification token
    const verificationToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
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

    // Find user and mark as verified
    const user = users.get(email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    
    // Remove verification token
    emailVerificationTokens.delete(email);
    
    // Save data
    saveData();

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
app.get('/api/user/traveler-profile', authenticateUser, (req, res) => {
  try {
    console.log(`👤 Getting traveler profile for user: ${req.userId}`);
    
    const user = Array.from(users.values()).find(u => u.id === req.userId);
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

app.put('/api/user/traveler-profile', authenticateUser, (req, res) => {
  try {
    const { travelerProfile } = req.body;
    console.log(`💾 Updating traveler profile for user: ${req.userId}`);
    console.log(`📝 New profile data:`, JSON.stringify(travelerProfile, null, 2));
    
    const user = Array.from(users.values()).find(u => u.id === req.userId);
    
    if (!user) {
      console.log(`❌ User not found: ${req.userId}`);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ Found user: ${user.email}`);
    console.log(`📝 Previous profile:`, JSON.stringify(user.travelerProfile, null, 2));
    
    user.travelerProfile = { ...user.travelerProfile, ...travelerProfile };
    
    // Save data to file
    saveData();
    
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
app.get('/api/user/stats', authenticateUser, (req, res) => {
  try {
    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate stats from user data
    const userTrips = Array.from(trips.values()).filter(trip => trip.userId === req.userId);
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

app.get('/api/user/stats/:userId', authenticateUser, (req, res) => {
  try {
    const { userId } = req.params;
    const user = Array.from(users.values()).find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate stats from user data
    const userTrips = Array.from(trips.values()).filter(trip => trip.userId === userId);
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
app.get('/api/user/friends', authenticateUser, (req, res) => {
  try {
    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get full friend objects from friend IDs
    const friendsList = [];
    if (user.friends && Array.isArray(user.friends)) {
      user.friends.forEach(friendId => {
        // Find friend by ID in the users map
        let friend = null;
        for (const [email, userData] of users) {
          if (userData.id === friendId) {
            friend = userData;
            break;
          }
        }
        if (friend) {
          friendsList.push({
            id: friend.id,
            name: friend.name,
            email: friend.email,
            travelerProfile: friend.travelerProfile,
            lastKnownLocation: friend.lastKnownLocation
          });
        }
      });
    }
    
    console.log(`👥 Friends for user ${req.userId}:`, friendsList.map(f => f.name));
    res.json({ data: { friends: friendsList } });
  } catch (error) {
    console.error('Get user friends error:', error);
    res.status(500).json({ error: 'Failed to get user friends' });
  }
});

// LLM config endpoints
app.get('/api/user/llm-config', authenticateUser, (req, res) => {
  try {
    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      llmConfig: user.llmConfig,
      savedAgents: user.savedAgents 
    });
  } catch (error) {
    console.error('Get LLM config error:', error);
    res.status(500).json({ error: 'Failed to get LLM config' });
  }
});

app.put('/api/user/llm-config', authenticateUser, (req, res) => {
  try {
    const { llmConfig, savedAgents } = req.body;
    const user = Array.from(users.values()).find(u => u.id === req.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (llmConfig) {
      user.llmConfig = { ...user.llmConfig, ...llmConfig };
    }

    if (savedAgents) {
      user.savedAgents = savedAgents;
    }

    res.json({ 
      message: 'LLM config updated successfully',
      llmConfig: user.llmConfig,
      savedAgents: user.savedAgents 
    });
  } catch (error) {
    console.error('Update LLM config error:', error);
    res.status(500).json({ error: 'Failed to update LLM config' });
  }
});

// Communities endpoints
app.get('/api/communities', (req, res) => {
  try {
    // Collect all communities from all users
    const allCommunities = [];
    users.forEach(user => {
      if (user.communities && Array.isArray(user.communities)) {
        allCommunities.push(...user.communities);
      }
    });
    
    // Remove duplicates based on community ID
    const uniqueCommunities = allCommunities.filter((community, index, self) => 
      index === self.findIndex(c => c.id === community.id)
    );
    
    // Enrich communities with full user objects for members
    const enrichedCommunities = uniqueCommunities.map(community => ({
      ...community,
      members: getFullUserObjects(community.members),
      memberCount: Array.isArray(community.members) ? community.members.length : 0,
    }));
    
    console.log(`🏘️ Returning ${enrichedCommunities.length} communities with enriched member data`);
    res.json({ communities: enrichedCommunities });
  } catch (error) {
    console.error('Get communities error:', error);
    res.status(500).json({ error: 'Failed to get communities' });
  }
});

// Simple search endpoint for users and communities
app.get('/api/search', authenticateUser, (req, res) => {
  try {
    const q = (req.query.q || '').toString().toLowerCase().trim();
    if (!q || q.length < 2) {
      return res.json({ users: [], communities: [] });
    }

    // Search users by name, email, nickname
    const matchedUsers = [];
    for (const [, user] of users) {
      const name = (user.name || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      const nickname = (user.travelerProfile?.nickname || '').toLowerCase();
      if (name.includes(q) || email.includes(q) || nickname.includes(q)) {
        matchedUsers.push({
          id: user.id,
          name: user.name,
          email: user.email,
          nickname: user.travelerProfile?.nickname || user.name,
          travelerProfile: user.travelerProfile,
          photo: user.travelerProfile?.photo || null,
        });
      }
    }

    // Aggregate communities and search by name/description
    const communitiesSet = new Map();
    users.forEach(user => {
      if (Array.isArray(user.communities)) {
        user.communities.forEach(c => communitiesSet.set(c.id, c));
      }
    });
    const allCommunities = Array.from(communitiesSet.values());
    const matchedCommunities = allCommunities
      .filter(c => (c.name || '').toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q))
      .map(c => ({ 
        ...c, 
        members: getFullUserObjects(c.members || []),
        memberCount: Array.isArray(c.members) ? c.members.length : 0,
      }));

    res.json({ users: matchedUsers, communities: matchedCommunities });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search' });
  }
});

app.post('/api/communities', authenticateUser, (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Community name is required' });
    }

    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const community = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      name,
      description: description || '',
      creator: { id: user.id, email: user.email, name: user.name },
      members: [user.id],
      createdAt: new Date().toISOString(),
    };

    // Store in user's communities
    if (!user.communities) user.communities = [];
    user.communities.push(community);
    saveData();

    console.log('🏘️ New community created:', community);
    res.status(201).json({ message: 'Community created', community });
  } catch (error) {
    console.error('❌ Error creating community:', error);
    res.status(500).json({ error: 'Failed to create community' });
  }
});

// Posts endpoints
app.get('/api/posts', (req, res) => {
  try {
    // Collect all posts from all users
    const allPosts = [];
    users.forEach(user => {
      if (user.posts && Array.isArray(user.posts)) {
        allPosts.push(...user.posts);
      }
    });
    
    // Enrich comments with user details if missing
    const getUserByNickname = (nickname) => {
      const nn = (nickname || '').toString().toLowerCase();
      for (const [, u] of users) {
        const uNick = (u.travelerProfile?.nickname || u.nickname || '').toLowerCase();
        if (uNick === nn) return u;
      }
      return null;
    };

    const enrichedPosts = allPosts.map((p) => {
      if (Array.isArray(p.comments)) {
        p.comments = p.comments.map((c) => {
          if (c.userId && c.userNickname && c.userPhoto) return c;
          const u = c.userId
            ? Array.from(users.values()).find((usr) => usr.id === c.userId)
            : getUserByNickname(c.userNickname);
          return {
            ...c,
            userId: c.userId || u?.id || c.userEmail || null,
            userName: c.userName || u?.name || c.userNickname || 'Anonymous',
            userNickname: c.userNickname || u?.travelerProfile?.nickname || u?.nickname || null,
            userPhoto: c.userPhoto || u?.travelerProfile?.photo || null,
            likes: Array.isArray(c.likes) ? c.likes : [],
          };
        });
        p.commentCount = p.comments.length;
      }
      // Normalize likeCount
      p.likeCount = Array.isArray(p.likes) ? p.likes.length : (p.likeCount || 0);
      return p;
    });

    // Sort by creation date (newest first)
    enrichedPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
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

// Trips endpoints (in-memory)
app.post('/api/trips', authenticateUser, (req, res) => {
  try {
    const user = Array.from(users.values()).find(u => u.id === req.userId);
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
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      userId: user.id,
      name,
      destination,
      dates,
      itinerary,
      preferences,
      travelerProfile,
      budget,
      tips,
      suggestions,
      isPublic,
      shareType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store in user's profile
    if (!user.trips) user.trips = [];
    user.trips.push({
      id: trip.id,
      name: trip.name,
      destination: trip.destination,
      dates: trip.dates,
      itinerary: trip.itinerary,
      budget: trip.budget,
      tips: trip.tips,
      summary: req.body.summary,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
      isPublic: trip.isPublic,
      shareType: trip.shareType,
    });

    // Store in global trips map for stats
    trips.set(trip.id, trip);
    saveData();

    res.json(trip);
  } catch (error) {
    console.error('Create trip error:', error);
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

app.get('/api/trips', authenticateUser, (req, res) => {
  try {
    const userTrips = Array.from(trips.values())
      .filter(t => t.userId === req.userId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    res.json(userTrips);
  } catch (error) {
    console.error('Get trips error:', error);
    res.status(500).json({ error: 'Failed to get trips' });
  }
});

app.put('/api/trips/:id', authenticateUser, (req, res) => {
  try {
    const { id } = req.params;
    const trip = trips.get(id);
    if (!trip || trip.userId !== req.userId) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const updates = { ...req.body };
    // Keep updatedAt fresh
    updates.updatedAt = new Date().toISOString();
    const updated = { ...trip, ...updates };
    trips.set(id, updated);

    // Also update on user object if present
    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (user && Array.isArray(user.trips)) {
      const idx = user.trips.findIndex(t => t.id === id);
      if (idx !== -1) {
        user.trips[idx] = {
          ...user.trips[idx],
          name: updated.name,
          destination: updated.destination,
          dates: updated.dates,
          itinerary: updated.itinerary,
          budget: updated.budget,
          tips: updated.tips,
          updatedAt: updated.updatedAt,
          isPublic: updated.isPublic,
          shareType: updated.shareType,
        };
      }
    }
    saveData();
    res.json(updated);
  } catch (error) {
    console.error('Update trip error:', error);
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

app.delete('/api/trips/:id', authenticateUser, (req, res) => {
  try {
    const { id } = req.params;
    const trip = trips.get(id);
    if (!trip || trip.userId !== req.userId) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    trips.delete(id);
    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (user && Array.isArray(user.trips)) {
      user.trips = user.trips.filter(t => t.id !== id);
    }
    saveData();
    res.json({ success: true });
  } catch (error) {
    console.error('Delete trip error:', error);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

app.post('/api/posts', authenticateUser, (req, res) => {
  try {
    const { content, location, connectedPOI } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'Post content is required' });
    }

    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const post = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      content,
      location: location || '',
      connectedPOI: connectedPOI || null,
      author: { 
        id: user.id, 
        email: user.email, 
        name: user.name,
        nickname: user.travelerProfile?.nickname || user.name,
        photo: user.travelerProfile?.photo || null
      },
      likes: 0,
      comments: [],
      createdAt: new Date().toISOString(),
    };

    // Store in user's posts
    if (!user.posts) user.posts = [];
    user.posts.push(post);
    saveData();

    console.log('📝 New post created:', post);
    res.status(201).json({ message: 'Post created', post });
  } catch (error) {
    console.error('❌ Error creating post:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Tripyy POI endpoints
app.get('/api/pois', (req, res) => {
  res.json({ pois });
});

app.post('/api/pois', authenticateUser, (req, res) => {
  try {
    const { name, coordinates, review, icon, description, photo, type, author } = req.body;
    if (!name || !coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
      return res.status(400).json({ error: 'Name and valid coordinates are required' });
    }
    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
  const poi = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      name,
      coordinates,
      user: { id: user.id, email: user.email, name: user.name },
      createdAt: new Date().toISOString(),
      review: review || '',
      icon: icon || '',
    description: description || '',
    // Store full Cloudinary URL if provided
    photo: photo || '',
      type: type || 'public',
      author: author || user.travelerProfile?.nickname || user.name || '',
    };
    pois.push(poi);
    saveData();
    console.log('📍 New POI added:', poi);
    res.status(201).json({ message: 'POI added', poi });
  } catch (error) {
    console.error('❌ Error adding POI:', error);
    res.status(500).json({ error: 'Failed to add POI' });
  }
});

// Update an existing public POI (by coordinates)
app.put('/api/pois', authenticateUser, (req, res) => {
  try {
    const { coordinates, name, icon, description, photo } = req.body;
    if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
      return res.status(400).json({ error: 'Valid coordinates are required' });
    }

    const idx = pois.findIndex(p => p.coordinates.lat === coordinates.lat && p.coordinates.lng === coordinates.lng);
    if (idx === -1) {
      return res.status(404).json({ error: 'POI not found' });
    }

    const poi = pois[idx];
    // Authorization: only the creator can edit (by user id or author nickname)
    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const isOwner = (poi.user?.id && poi.user.id === user.id) || (poi.author && (poi.author === (user.travelerProfile?.nickname || user.name)));
    if (!isOwner) {
      return res.status(403).json({ error: 'Not authorized to edit this POI' });
    }

    if (typeof name === 'string') poi.name = name;
    if (typeof icon === 'string') poi.icon = icon;
    if (typeof description === 'string') poi.description = description;
    if (typeof photo === 'string') {
      // If photo is being replaced and old photo is a Cloudinary asset, attempt to delete the old one
      try {
        if (poi.photo && typeof poi.photo === 'string' && poi.photo.startsWith('https://res.cloudinary.com/')) {
          const oldPublicId = extractCloudinaryPublicId(poi.photo);
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
      poi.photo = photo; // allow full URL or filename
    }

    saveData();
    return res.json({ message: 'POI updated', poi });
  } catch (error) {
    console.error('❌ Error updating POI:', error);
    return res.status(500).json({ error: 'Failed to update POI' });
  }
});

// Delete an existing public POI (by coordinates)
app.delete('/api/pois', authenticateUser, (req, res) => {
  try {
    const { coordinates } = req.body || {};
    if (!coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
      return res.status(400).json({ error: 'Valid coordinates are required' });
    }

    const idx = pois.findIndex(p => p.coordinates.lat === coordinates.lat && p.coordinates.lng === coordinates.lng);
    if (idx === -1) {
      return res.status(404).json({ error: 'POI not found' });
    }

    // Authorization: only the creator can delete (by user id or author nickname)
    const poi = pois[idx];
    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    const isOwner = (poi.user?.id && poi.user.id === user.id) || (poi.author && (poi.author === (user.travelerProfile?.nickname || user.name)));
    if (!isOwner) {
      return res.status(403).json({ error: 'Not authorized to delete this POI' });
    }

    const deleted = pois.splice(idx, 1)[0];
    saveData();

    // Attempt to delete Cloudinary photo if the POI used one
    try {
      if (deleted && deleted.photo && typeof deleted.photo === 'string' && deleted.photo.startsWith('https://res.cloudinary.com/')) {
        const publicId = extractCloudinaryPublicId(deleted.photo);
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
app.post('/api/pois/review', authenticateUser, (req, res) => {
  try {
    const { coordinates, rating, text, author, authorPhoto, photo } = req.body;
    
    if (!coordinates || !rating || !text) {
      return res.status(400).json({ error: 'Coordinates, rating, and text are required' });
    }

    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Find existing POI at these coordinates or create a new one
    let poi = pois.find(p => 
      p.coordinates.lat === coordinates.lat && 
      p.coordinates.lng === coordinates.lng
    );

    if (!poi) {
      // Create a new POI
      poi = {
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        name: 'Unknown Location',
        coordinates,
        user: { id: user.id, email: user.email, name: user.name },
        createdAt: new Date().toISOString(),
        reviews: [],
        type: 'public',
        author: user.travelerProfile?.nickname || user.name || '',
      };
      pois.push(poi);
    }

    // Initialize reviews array if it doesn't exist
    if (!poi.reviews) {
      poi.reviews = [];
    }

    // Add review
    const newReview = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      rating,
      text: text.trim(),
      author: author || user.travelerProfile?.nickname || user.name,
      authorPhoto: authorPhoto || user.travelerProfile?.photo || null,
      photo: photo || null,
      createdAt: new Date().toISOString(),
      likes: []
    };

    poi.reviews.push(newReview);
    
    // Calculate average rating
    const totalRating = poi.reviews.reduce((sum, review) => sum + review.rating, 0);
    poi.averageRating = totalRating / poi.reviews.length;
    poi.reviewCount = poi.reviews.length;
    
    saveData();
    
    console.log(`📝 Review added to POI at ${coordinates.lat}, ${coordinates.lng} by ${newReview.author}`);
    res.json({ 
      success: true, 
      poi,
      review: newReview
    });
  } catch (error) {
    console.error('❌ Error adding POI review:', error);
    res.status(500).json({ error: 'Failed to add POI review' });
  }
});

// Post like endpoint
app.post('/api/posts/:postId/like', authenticateUser, (req, res) => {
  try {
    const { postId } = req.params;
    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Find the post in all users' posts
    let foundPost = null;
    let foundUser = null;
    
    for (const [email, userData] of users) {
      if (userData.posts) {
        const post = userData.posts.find(p => p.id === postId);
        if (post) {
          foundPost = post;
          foundUser = userData;
          break;
        }
      }
    }

    if (!foundPost) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Initialize likes array if it doesn't exist
    if (!foundPost.likes) {
      foundPost.likes = [];
    }

    // Toggle like
    const userNickname = user.travelerProfile?.nickname || user.name;
    const likeIndex = foundPost.likes.indexOf(userNickname);
    
    if (likeIndex === -1) {
      // Add like
      foundPost.likes.push(userNickname);
    } else {
      // Remove like
      foundPost.likes.splice(likeIndex, 1);
    }

    // Update like count
    foundPost.likeCount = foundPost.likes.length;
    
    saveData();
    
    console.log(`👍 Post ${postId} ${likeIndex === -1 ? 'liked' : 'unliked'} by ${userNickname}`);
    res.json({ 
      success: true, 
      post: foundPost,
      liked: likeIndex === -1
    });
  } catch (error) {
    console.error('❌ Error liking post:', error);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// Post comment endpoint
app.post('/api/posts/:postId/comments', authenticateUser, (req, res) => {
  try {
    const { postId } = req.params;
    const { comment } = req.body;
    
    if (!comment || !comment.trim()) {
      return res.status(400).json({ error: 'Comment text is required' });
    }

    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Find the post in all users' posts
    let foundPost = null;
    let foundUser = null;
    
    for (const [email, userData] of users) {
      if (userData.posts) {
        const post = userData.posts.find(p => p.id === postId);
        if (post) {
          foundPost = post;
          foundUser = userData;
          break;
        }
      }
    }

    if (!foundPost) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Initialize comments array if it doesn't exist
    if (!foundPost.comments) {
      foundPost.comments = [];
    }

    // Add comment with rich user info
    const newComment = {
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      text: comment.trim(),
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      userNickname: user.travelerProfile?.nickname || user.name,
      userPhoto: user.travelerProfile?.photo || null,
      likes: [],
      createdAt: new Date().toISOString()
    };

    foundPost.comments.push(newComment);
    foundPost.commentCount = foundPost.comments.length;
    
    saveData();
    
    console.log(`💬 Comment added to post ${postId} by ${newComment.userNickname}`);
    res.json({ 
      success: true, 
      post: foundPost,
      comment: newComment
    });
  } catch (error) {
    console.error('❌ Error adding comment:', error);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

// Like a specific comment on a post
app.post('/api/posts/:postId/comments/:commentId/like', authenticateUser, (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Find the post
    let foundPost = null;
    for (const [, userData] of users) {
      if (userData.posts) {
        const post = userData.posts.find(p => p.id === postId);
        if (post) { foundPost = post; break; }
      }
    }
    if (!foundPost) return res.status(404).json({ error: 'Post not found' });

    // Find comment
    const comment = (foundPost.comments || []).find((c) => c.id === commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    if (!Array.isArray(comment.likes)) comment.likes = [];
    const nickname = user.travelerProfile?.nickname || user.name;
    const idx = comment.likes.indexOf(nickname);
    if (idx === -1) comment.likes.push(nickname); else comment.likes.splice(idx, 1);

    // Update counts
    foundPost.commentCount = (foundPost.comments || []).length;
    foundPost.likeCount = (foundPost.likes || []).length;
    saveData();
    res.json({ success: true, post: foundPost });
  } catch (error) {
    console.error('❌ Error liking comment:', error);
    res.status(500).json({ error: 'Failed to like comment' });
  }
});

// POI review like endpoint
app.post('/api/pois/review/like', authenticateUser, (req, res) => {
  try {
    const { reviewId } = req.body;
    
    if (!reviewId) {
      return res.status(400).json({ error: 'Review ID is required' });
    }

    const user = Array.from(users.values()).find(u => u.id === req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Find the review in all POIs
    let foundReview = null;
    let foundPoi = null;
    
    for (const poi of pois) {
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
    const userNickname = user.travelerProfile?.nickname || user.name;
    const likeIndex = foundReview.likes.indexOf(userNickname);
    
    if (likeIndex === -1) {
      // Add like
      foundReview.likes.push(userNickname);
    } else {
      // Remove like
      foundReview.likes.splice(likeIndex, 1);
    }
    
    saveData();
    
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

// Helper function to get full user objects from user IDs
const getFullUserObjects = (userIds) => {
  return userIds.map(userId => {
    const user = Array.from(users.values()).find(u => u.id === userId);
    if (user) {
      return {
        id: user.id,
        name: user.name,
        nickname: user.nickname || user.travelerProfile?.nickname,
        email: user.email,
        photo: user.photo || user.travelerProfile?.photo,
        travelerProfile: user.travelerProfile
      };
    }
    return null;
  }).filter(user => user !== null);
};

// Community join endpoint
app.post('/api/communities/:communityId/join', authenticateUser, (req, res) => {
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

    // Add user to community members if not already a member
    if (!foundCommunity.members.includes(user.id)) {
      foundCommunity.members.push(user.id);
    }
    
    saveData();
    
    console.log(`👥 User ${user.id} joined community ${communityId}`);
    
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

// Start server
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