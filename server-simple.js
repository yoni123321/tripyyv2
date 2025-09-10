const express = require('express');
const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { Expo } = require('expo-server-sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const { pool, initDatabase, testConnection } = require('./src/config/database');
const dbService = require('./src/services/database-service');

// Initialize Expo client
const expo = new Expo();

// Helper function to send notification to a user
async function sendNotificationToUser(userId, notification) {
  try {
    // Get user's push token
    const result = await pool.query(
      'SELECT push_token, name FROM users WHERE id = $1',
      [userId]
    );
    
    if (!result.rows[0]?.push_token) {
      console.log(`📱 No push token found for user ${userId}`);
      return;
    }
    
    // Create notification message
    const message = {
      to: result.rows[0].push_token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      icon: 'https://res.cloudinary.com/djnd4utmi/image/upload/v1757524265/golden-dog_p6nsrz.png'
    };
    
    // Send notification
    const chunks = expo.chunkPushNotifications([message]);
    
    for (let chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (error) {
        console.error('❌ Error sending push notification:', error);
      }
    }
    
    console.log(`📤 Notification sent to user ${userId} (${result.rows[0].name})`);
  } catch (error) {
    console.error('❌ Error in sendNotificationToUser:', error);
  }
}
const emailService = require('./src/services/email-service');

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
    
    // Schedule post cleanup
    schedulePostCleanup();
    
    // Schedule cleanup tasks
    scheduleCleanupTasks();
    
    // Start server
    startServer();
  } catch (error) {
    console.error('❌ Server initialization failed:', error);
    console.error('💡 Check Railway logs for more details');
    process.exit(1);
  }
}

// Database operations are now handled by dbService

// Helper function to delete posts older than 24 hours
async function cleanupOldPosts() {
  try {
    console.log('🧹 Starting cleanup of posts older than 24 hours...');
    
    // First, get posts that will be deleted (for logging)
    const oldPosts = await dbService.getPostsOlderThan(24);
    console.log(`📊 Found ${oldPosts.length} posts older than 24 hours`);
    
    if (oldPosts.length > 0) {
      console.log('🗑️ Posts to be deleted:');
      oldPosts.forEach(post => {
        console.log(`   - ID: ${post.id}, Created: ${post.created_at}, Content: ${post.content?.substring(0, 50)}...`);
      });
      
      // Delete the old posts
      const deletedPosts = await dbService.deletePostsOlderThan(24);
      console.log(`✅ Successfully deleted ${deletedPosts.length} posts older than 24 hours`);
    } else {
      console.log('✨ No posts older than 24 hours found');
    }
  } catch (error) {
    console.error('❌ Error during post cleanup:', error);
  }
}

// Schedule post cleanup to run every hour
function schedulePostCleanup() {
  // Run cleanup immediately on startup
  cleanupOldPosts();
  
  // Then schedule to run every hour
  setInterval(cleanupOldPosts, 60 * 60 * 1000); // 60 minutes * 60 seconds * 1000 milliseconds
  
  console.log('⏰ Post cleanup scheduled to run every hour');
}

// Schedule cleanup tasks
const scheduleCleanupTasks = () => {
  // Clean up old posts every hour
  setInterval(async () => {
    try {
      const deletedCount = await dbService.deletePostsOlderThan(24);
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} old posts`);
    }
  } catch (error) {
    console.error('❌ Error during post cleanup:', error);
  }
  }, 60 * 60 * 1000); // Every hour

  // Clean up expired verification tokens every 6 hours
  setInterval(async () => {
    try {
      const deletedCount = await dbService.cleanupVerificationTokens();
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} expired verification tokens`);
      }
    } catch (error) {
      console.error('❌ Error during token cleanup:', error);
    }
  }, 6 * 60 * 60 * 1000); // Every 6 hours

  // Clean up expired tokens every hour
  setInterval(async () => {
    try {
      const deletedCount = await dbService.deleteExpiredVerificationTokens();
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} expired tokens`);
      }
    } catch (error) {
      console.error('❌ Error during expired token cleanup:', error);
    }
  }, 60 * 60 * 1000); // Every hour
};

// Initialize server with database
initializeServer().catch(error => {
  console.error('❌ Fatal error during server initialization:', error);
  process.exit(1);
});

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

// Helper function to check if user is admin
const isUserAdmin = async (userId) => {
  try {
    const result = await pool.query(`
      SELECT role FROM admins WHERE user_id = $1 AND is_active = true
    `, [userId]);
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
};

// Helper function to check if user is super admin
const isUserSuperAdmin = async (userId) => {
  try {
    const result = await pool.query(`
      SELECT role FROM admins WHERE user_id = $1 AND is_active = true AND role = 'super_admin'
    `, [userId]);
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking super admin status:', error);
    return false;
  }
};

// Helper function to validate report data
const validateReportData = (data) => {
  const { targetType, targetId, issueType, description } = data;
  
  // Check required fields
  if (!targetType || !targetId || !issueType || !description) {
    return { valid: false, error: 'Missing required fields' };
  }
  
  // Validate target type
  const validTargetTypes = ['poi', 'post', 'comment', 'group'];
  if (!validTargetTypes.includes(targetType)) {
    return { valid: false, error: 'Invalid target type' };
  }
  
  // Validate issue type
  const validIssueTypes = ['spam', 'harassment', 'inappropriate_content', 'fake_information', 
                          'copyright_violation', 'hate_speech', 'violence', 'other'];
  if (!validIssueTypes.includes(issueType)) {
    return { valid: false, error: 'Invalid issue type' };
  }
  
  // Validate description length
  if (description.length < 10) {
    return { valid: false, error: 'Description must be at least 10 characters long' };
  }
  
  if (description.length > 1000) {
    return { valid: false, error: 'Description must be less than 1000 characters' };
  }
  
  return { valid: true };
};

// Helper function to fetch target data for reports
const fetchTargetData = async (targetType, targetId) => {
  try {
    let targetData = { name: null, content: null, author: null };
    
    switch (targetType) {
      case 'poi':
        const poi = await dbService.getPOIById(targetId);
        if (poi) {
          targetData = {
            name: poi.name,
            content: poi.description,
            author: {
              id: poi.user_id,
              name: poi.author,
              type: 'poi_author'
            }
          };
        }
        break;
        
      case 'post':
        const post = await dbService.getPostById(targetId);
        if (post) {
          const author = await dbService.getUserById(post.user_id);
          targetData = {
            name: `Post by ${author?.name || 'Unknown'}`,
            content: post.content,
            author: {
              id: post.user_id,
              name: author?.name,
              email: author?.email,
              type: 'post_author'
            }
          };
        }
        break;
        
      case 'comment':
        // For comments, we might need to implement a getCommentById method
        // For now, we'll return basic info
        targetData = {
          name: 'Comment',
          content: 'Comment content not available',
          author: { type: 'comment_author' }
        };
        break;
        
      case 'group':
        const community = await dbService.getCommunityById(targetId);
        if (community) {
          const creator = await dbService.getUserById(community.created_by);
          targetData = {
            name: community.name,
            content: community.description,
            author: {
              id: community.created_by,
              name: creator?.name,
              email: creator?.email,
              type: 'group_creator'
            }
          };
        }
        break;
    }
    
    return targetData;
  } catch (error) {
    console.error('Error fetching target data:', error);
    return { name: null, content: null, author: null };
  }
};

// Enhanced logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`📡 [${timestamp}] ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`   📝 Request body:`, JSON.stringify(req.body, null, 2));
  }
  if (req.headers.authorization) {
    console.log(`   🔐 Authorization: Bearer ${req.headers.authorization.substring(0, 20)}...`);
  }
  next();
});

// Test endpoint to verify PUT requests work
app.put('/api/test-put', (req, res) => {
  console.log('🧪 Test PUT endpoint called');
  console.log('📝 Request body:', JSON.stringify(req.body, null, 2));
  res.json({ data: { message: 'PUT endpoint working', received: req.body } });
});

// Simple test endpoint without authentication
app.put('/api/test-simple', (req, res) => {
  console.log('🧪 Simple test PUT endpoint called');
  console.log('📝 Request body:', JSON.stringify(req.body, null, 2));
  res.json({ data: { message: 'Simple PUT endpoint working', received: req.body } });
});

// Test traveler profile endpoint without authentication
app.put('/api/test-traveler-profile', (req, res) => {
  console.log('🧪 Test traveler profile endpoint called');
  console.log('📝 Raw request body:', JSON.stringify(req.body, null, 2));
  console.log('📝 Request body type:', typeof req.body);
  console.log('📝 Request body keys:', Object.keys(req.body || {}));
  
  const travelerProfile = req.body?.travelerProfile || req.body || {};
  console.log('📝 Extracted traveler profile:', JSON.stringify(travelerProfile, null, 2));
  
  res.json({ 
    data: { 
      message: 'Test traveler profile endpoint working', 
      received: req.body,
      extracted: travelerProfile,
      method: req.body?.travelerProfile ? 'req.body.travelerProfile' : 'req.body'
    } 
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    const dbResult = await pool.query('SELECT NOW()');
    const dbConnected = !!dbResult.rows[0];
    
    // Get email service status
    const emailStatus = emailService.getStatus();
    
  res.json({
      status: 'healthy',
    timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: dbConnected ? 'Connected' : 'Disconnected',
      email: emailStatus.configured ? 'Configured' : 'Not Configured',
      services: {
        database: dbConnected,
        email: emailStatus.configured,
        cloudinary: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
        paypal: !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
        stripe: !!process.env.STRIPE_SECRET_KEY
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Email service status endpoint
app.get('/api/email/status', (req, res) => {
  const status = emailService.getStatus();
  res.json({
    data: {
      configured: status.configured,
      fromEmail: status.fromEmail,
      fromName: status.fromName,
      hasApiKey: status.hasApiKey,
      ready: emailService.isReady()
    }
  });
});

// Manual post cleanup endpoint (for testing and admin use)
app.post('/api/admin/cleanup-posts', authenticateUser, async (req, res) => {
  try {
    console.log('🧹 Manual post cleanup requested by user:', req.userId);
    
    // Check if user is admin (you can add more sophisticated admin checks here)
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // For now, allow any authenticated user to trigger cleanup
    // In production, you might want to restrict this to admin users only
    
    // Get posts that will be deleted
    const oldPosts = await dbService.getPostsOlderThan(24);
    console.log(`📊 Found ${oldPosts.length} posts older than 24 hours`);
    
    if (oldPosts.length === 0) {
      return res.json({ 
        data: { 
          message: 'No posts older than 24 hours found',
          deletedCount: 0,
          oldPosts: []
        } 
      });
    }
    
    // Delete the old posts
    const deletedPosts = await dbService.deletePostsOlderThan(24);
    
    console.log(`✅ Manual cleanup completed: ${deletedPosts.length} posts deleted`);
    
    res.json({ 
      data: { 
        message: `Successfully deleted ${deletedPosts.length} posts older than 24 hours`,
        deletedCount: deletedPosts.length,
        deletedPosts: deletedPosts.map(p => ({
          id: p.id,
          created_at: p.created_at
        }))
      } 
    });
  } catch (error) {
    console.error('❌ Manual cleanup error:', error);
    res.status(500).json({ error: 'Failed to cleanup posts' });
  }
});

// Migration endpoint - triggers data migration from data.json
app.post('/api/migrate', async (req, res) => {
  try {
    console.log('🚀 Migration endpoint triggered...');
    
    // Check for force migration parameter
    const forceMigration = req.query.force === 'true';
    console.log(`🔧 Force migration: ${forceMigration}`);
    
    // Check if data already exists
    const userCount = await dbService.getUserCount();
    console.log(`🔍 Current user count in database: ${userCount}`);
    
    // If we have users, check if they're the ones we want to migrate
    if (userCount > 0 && !forceMigration) {
      const existingUser = await dbService.getUserByEmail('dev@tripyy.com');
      if (existingUser) {
        console.log('⚠️ User dev@tripyy.com already exists, checking if migration is needed...');
        
        // Check if we have the expected data
        const hasTrips = existingUser.trips && existingUser.trips.length > 0;
        const hasPOIs = await dbService.getPOICount() > 0;
        
        if (hasTrips && hasPOIs) {
          return res.json({
            status: 'already_migrated',
            message: 'Data appears to already be migrated. Use ?force=true to force migration.',
            userCount,
            hasTrips,
            hasPOIs
          });
        } else {
          console.log('🔄 Partial data found, continuing with migration...');
        }
      } else {
        console.log('🔄 Users exist but not the expected ones, continuing with migration...');
      }
    }
    
    // Read and parse data.json
    const fs = require('fs');
    const path = require('path');
    const dataPath = path.join(__dirname, 'data', 'data.json');
    
    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({
        status: 'error',
        message: 'data.json not found'
      });
    }
    
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    console.log(`📂 Found data: ${data.users?.length || 0} users, ${data.trips?.length || 0} trips, ${data.pois?.length || 0} POIs`);
    
    let migratedCount = 0;
    
    // Migrate users
    if (data.users && data.users.length > 0) {
      console.log('👤 Migrating users...');
      for (const [email, userData] of data.users) {
        try {
          const userId = await dbService.createUser({
            email: userData.email,
            password: userData.password,
            name: userData.name,
            createdAt: new Date(userData.createdAt),
            lastLogin: new Date(userData.lastLogin),
                    emailVerified: userData.email_verified,
        emailVerifiedAt: userData.email_verified_at ? new Date(userData.email_verified_at) : null,
            preferences: userData.preferences || {},
            travelerProfile: userData.travelerProfile || {},
            llmConfig: userData.llmConfig || {},
            savedAgents: userData.savedAgents || [],
            friends: userData.friends || [],
            communities: userData.communities || [],
            posts: userData.posts || [],
            trips: userData.trips || [],
            likes: userData.likes || 0,
            lastKnownLocation: userData.lastKnownLocation || null
          });
          
          console.log(`✅ User migrated: ${userData.email} (ID: ${userId})`);
          userData._newId = userId;
          migratedCount++;
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
          const user = await dbService.getUserByEmail(tripData.user?.email || 'dev@tripyy.com');
          if (!user) {
            console.log(`⚠️ Skipping trip ${tripId} - user not found`);
            continue;
          }
          
          const tripId = await dbService.createTrip({
            userId: user.id,
            name: tripData.name,
            destination: tripData.destination || '',
            startDate: tripData.dates?.start ? new Date(tripData.dates.start) : null,
            endDate: tripData.dates?.end ? new Date(tripData.dates.end) : null,
            itinerary: tripData.itinerary || {},
            preferences: tripData.preferences || {},
            travelerProfile: tripData.travelerProfile || {},
            budget: tripData.budget || {},
            tips: tripData.tips || [],
            suggestions: tripData.suggestions || [],
            isPublic: tripData.isPublic || false,
            shareType: tripData.shareType || 'private',
            createdAt: new Date(tripData.createdAt),
            updatedAt: new Date(tripData.updatedAt)
          });
          
          console.log(`✅ Trip migrated: ${tripData.name} (ID: ${tripId})`);
          migratedCount++;
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
          const user = await dbService.getUserByEmail(poiData.user?.email || 'dev@tripyy.com');
          if (!user) {
            console.log(`⚠️ Skipping POI ${poiData.name} - user not found`);
            continue;
          }
          
          const poiId = await dbService.createPOI({
            name: poiData.name,
            description: poiData.description || '',
            location: poiData.coordinates || {},
            photos: [poiData.photo || ''],
            icon: poiData.icon || '',
            type: poiData.type || 'public',
            author: poiData.author || poiData.user?.name || '',
            userId: user.id,
            reviews: poiData.reviews || [],
            averageRating: poiData.averageRating || 0,
            reviewCount: poiData.reviewCount || 0,
            createdAt: new Date(poiData.createdAt)
          });
          
          console.log(`✅ POI migrated: ${poiData.name} (ID: ${poiId})`);
          migratedCount++;
        } catch (error) {
          console.error(`❌ Failed to migrate POI ${poiData.name}:`, error.message);
        }
      }
    }
    
    // Migrate communities from user data
    console.log('🏘️ Migrating communities...');
    for (const [email, userData] of data.users || []) {
      if (userData.communities && userData.communities.length > 0) {
        for (const communityData of userData.communities) {
          try {
            const user = await dbService.getUserByEmail(email);
            if (!user) {
              console.log(`⚠️ Skipping community ${communityData.name} - user not found`);
              continue;
            }
            
            const communityId = await dbService.createCommunity({
              name: communityData.name,
              description: communityData.description || '',
              createdBy: user.id,
              members: communityData.members || [],
              createdAt: new Date(communityData.createdAt)
            });
            
            console.log(`✅ Community migrated: ${communityData.name} (ID: ${communityId})`);
            migratedCount++;
          } catch (error) {
            console.error(`❌ Failed to migrate community ${communityData.name}:`, error.message);
          }
        }
      }
    }
    
    // Migrate posts from user data
    console.log('📝 Migrating posts...');
    for (const [email, userData] of data.users || []) {
      if (userData.posts && userData.posts.length > 0) {
        for (const postData of userData.posts) {
          try {
            const user = await dbService.getUserByEmail(email);
            if (!user) {
              console.log(`⚠️ Skipping post - user not found`);
              continue;
            }
            
            const postId = await dbService.createPost({
              userId: user.id,
              content: postData.content || '',
              photos: postData.photos || [],
              location: postData.location || '',
              connectedPOI: postData.connectedPOI || '',
              likes: postData.likes || [],
              comments: postData.comments || [],
              likeCount: postData.likes?.length || 0,
              commentCount: postData.comments?.length || 0,
              createdAt: new Date(postData.createdAt)
            });
            
            console.log(`✅ Post migrated for user ${email}`);
            migratedCount++;
          } catch (error) {
            console.error(`❌ Failed to migrate post for user ${email}:`, error.message);
          }
        }
      }
    }
    
    console.log('🎉 Migration completed successfully!');
    res.json({
      status: 'success',
      message: 'Migration completed successfully',
      migratedCount,
      summary: {
        users: data.users?.length || 0,
        trips: data.trips?.length || 0,
        pois: data.pois?.length || 0,
        communities: 'Migrated from user data'
      }
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({
      status: 'error',
      message: 'Migration failed',
      error: error.message
    });
  }
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
      email_verified: false, // New users need email verification
      email_verified_at: null,
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

    // Generate 6-digit verification code
    const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store verification token in database
    await dbService.createVerificationToken(email, verificationToken, 'email_verification', expiresAt);

    // Send verification email
    try {
      await emailService.sendVerificationEmail(email, verificationToken, name);
      console.log(`📧 Verification email sent to: ${email}`);
    } catch (emailError) {
      console.error('❌ Failed to send verification email:', emailError);
      // Don't fail registration if email fails, but log it
    }

    // Generate token (user can login but with limited access until verified)
    const token = generateToken(userId);

    console.log(`✅ User registered successfully: ${email}`);
    res.status(201).json({
      message: 'User registered successfully. Please check your email to verify your account.',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: false
      },
      needsVerification: true
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
    if (email !== 'dev@tripyy.com' && !user.email_verified) {
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

    // Check if user is already verified
    if (user.email_verified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }

    // Generate new 6-digit verification code
    const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store verification token in database
    await dbService.createVerificationToken(email, verificationToken, 'email_verification', expiresAt);

    // Send verification email
    const emailResult = await emailService.sendVerificationEmail(email, verificationToken, user.name);
    
    if (emailResult.success) {
      console.log(`📧 Verification email sent to: ${email}`);
    res.json({ 
      message: 'Verification email sent successfully',
        // In production, don't return the token
        ...(process.env.NODE_ENV === 'development' && { token: verificationToken })
    });
    } else {
      console.error('❌ Failed to send verification email:', emailResult.error);
      res.status(500).json({ error: 'Failed to send verification email' });
    }
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
    const verificationData = await dbService.getVerificationToken(email, token, 'email_verification');
    if (!verificationData) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
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
    
    // Mark verification token as used
    await dbService.markVerificationTokenAsUsed(verificationData.id);

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(email, user.name);
      console.log(`📧 Welcome email sent to: ${email}`);
    } catch (emailError) {
      console.error('❌ Failed to send welcome email:', emailError);
      // Don't fail verification if welcome email fails
    }

    console.log(`✅ Email verified for user: ${email}`);

    res.json({ 
      message: 'Email verified successfully! Welcome to Tripyy!',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: true
      }
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: 'Email verification failed' });
  }
});

// User profile endpoints - enhanced with proper interests handling
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
    const travelerProfile = user.traveler_profile || {};
    
    // Ensure all personal information fields are present with defaults
    // Explicitly handle interests field to prevent it from being empty
    const merged = {
      name: travelerProfile.name || user.name || '',
      nickname: travelerProfile.nickname || '',
      birthday: travelerProfile.birthday || null,
      photo: (travelerProfile && travelerProfile.photo) || user.photo || null,
      age: travelerProfile.age || 0,
      // Ensure interests field is properly populated (not from activities)
      interests: Array.isArray(travelerProfile.interests) ? travelerProfile.interests : [],
      dietaryRestrictions: Array.isArray(travelerProfile.dietaryRestrictions) ? travelerProfile.dietaryRestrictions : [],
      accessibilityNeeds: Array.isArray(travelerProfile.accessibilityNeeds) ? travelerProfile.accessibilityNeeds : [],
      numberOfTravelers: travelerProfile.numberOfTravelers || 0,
      // Include any other fields from traveler_profile
      ...travelerProfile
    };
    
    console.log(`📝 Current profile with interests:`, JSON.stringify(merged, null, 2));
    console.log(`🎯 Interests field:`, JSON.stringify(merged.interests, null, 2));
    
    // Return a stable shape used by the app, wrapped in data format
    res.json({ data: { travelerProfile: merged } });
  } catch (error) {
    console.error('❌ Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

app.put('/api/user/traveler-profile', authenticateUser, async (req, res) => {
  try {
    console.log(`\n🔍 === TRAVELER PROFILE UPDATE DEBUG ===`);
    console.log(`👤 User ID from token: ${req.userId}`);
    console.log(`📝 Raw request body:`, JSON.stringify(req.body, null, 2));
    console.log(`📝 Request body type:`, typeof req.body);
    console.log(`📝 Request body keys:`, Object.keys(req.body || {}));
    
    const incomingTravelerProfile = req.body?.travelerProfile || req.body || {};
    console.log(`📝 Extracted traveler profile:`, JSON.stringify(incomingTravelerProfile, null, 2));
    console.log(`📝 Profile extraction method:`, req.body?.travelerProfile ? 'req.body.travelerProfile' : 'req.body');
    
    // Get user from database by ID
    const user = await dbService.getUserById(req.userId);
    
    if (!user) {
      console.log(`❌ User not found: ${req.userId}`);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`✅ Found user: ${user.email}`);
    const previousProfile = user.traveler_profile || {};
    console.log(`📝 Previous profile from DB:`, JSON.stringify(previousProfile, null, 2));
    
    // Ensure interests field is properly handled (not stored under activities)
    const processedProfile = {
      ...incomingTravelerProfile,
      // Explicitly ensure interests field is preserved
      interests: incomingTravelerProfile.interests || previousProfile.interests || [],
      // Ensure other fields are also properly handled
      dietaryRestrictions: incomingTravelerProfile.dietaryRestrictions || previousProfile.dietaryRestrictions || [],
      accessibilityNeeds: incomingTravelerProfile.accessibilityNeeds || previousProfile.accessibilityNeeds || [],
      numberOfTravelers: incomingTravelerProfile.numberOfTravelers || previousProfile.numberOfTravelers || 0
    };
    
    // Merge with existing profile
    const mergedProfile = { ...previousProfile, ...processedProfile };
    console.log(`📝 Processed profile:`, JSON.stringify(processedProfile, null, 2));
    console.log(`📝 Merged profile:`, JSON.stringify(mergedProfile, null, 2));

    // Persist to database
    console.log(`💾 Saving to database with email: ${user.email}`);
    console.log(`💾 Update data structure:`, JSON.stringify({ travelerProfile: mergedProfile }, null, 2));
    
    const updateResult = await dbService.updateUser(user.email, { travelerProfile: mergedProfile });
    console.log(`✅ Database update result:`, updateResult);

    // Reload fresh user from DB to ensure we return the saved state
    const refreshed = await dbService.getUserById(req.userId);
    console.log(`🔄 Reloaded user from DB:`, JSON.stringify(refreshed?.traveler_profile, null, 2));
    const savedProfile = refreshed?.traveler_profile || mergedProfile;
    
    console.log(`✅ Profile updated successfully`);
    console.log(`📝 Final saved profile:`, JSON.stringify(savedProfile, null, 2));
    console.log(`🔍 === END DEBUG ===\n`);

    res.json({ data: { travelerProfile: savedProfile } });
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

app.get('/api/user/stats/:identifier', authenticateUser, async (req, res) => {
  try {
    const { identifier } = req.params;
    let userId = identifier;
    
    // If identifier is not a number, try to resolve by nickname
    if (isNaN(identifier)) {
      const userResult = await pool.query(
        'SELECT id FROM users WHERE traveler_profile->>\'nickname\' = $1',
        [identifier]
      );
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      userId = userResult.rows[0].id;
    }

    const user = await dbService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate stats from database
    const userTrips = await dbService.getUserTrips(userId);
    const userFriends = user.friends || [];
    const userLikes = user.likes || 0;

    res.json({ 
      success: true,
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
        try {
          // Handle both numeric IDs and string IDs
          let friend;
          if (typeof friendId === 'number' || !isNaN(friendId)) {
            friend = await dbService.getUserById(friendId);
          } else {
            // For string IDs like "friend-1", try to find by email or name
            friend = await dbService.getUserByEmail(friendId);
            if (!friend) {
              // Try to find by name if it looks like a name
              friend = await dbService.getUserByName(friendId);
            }
          }
          
        if (friend) {
          friendsList.push({
            id: friend.id,
            name: friend.name,
            email: friend.email,
              travelerProfile: friend.traveler_profile,
              lastKnownLocation: friend.last_known_location
          });
          } else {
            console.log(`⚠️ Friend not found: ${friendId}`);
        }
        } catch (friendError) {
          console.error(`Error looking up friend ${friendId}:`, friendError.message);
        }
      }
    }
    
    console.log(`👥 Friends for user ${req.userId}: ${friendsList.length} found`);
    res.json({ friends: friendsList });
  } catch (error) {
    console.error('Get user friends error:', error);
    res.status(500).json({ error: 'Failed to get user friends' });
  }
});

// User traveler profile endpoint (removed duplicate - using the first one above)

// Update traveler profile endpoint (removed duplicate - using the first one above)

// Check nickname availability endpoint (frontend compatible)
app.get('/api/check-nickname/:nickname', async (req, res) => {
  try {
    const { nickname } = req.params;
    
    if (!nickname) {
      return res.status(400).json({ error: 'Nickname is required' });
    }

    console.log(`🔍 Checking nickname availability for: "${nickname}"`);

    // Check if nickname exists
    const existingUser = await dbService.getUserByNickname(nickname);
    
    if (existingUser) {
      console.log(`❌ Nickname "${nickname}" is already taken by user: ${existingUser.email}`);
      res.json({ data: { 
        nickname: nickname,
        isAvailable: false, 
        message: 'Nickname already taken' 
      } });
    } else {
      console.log(`✅ Nickname "${nickname}" is available`);
      res.json({ data: { 
        nickname: nickname,
        isAvailable: true, 
        message: 'Nickname available' 
      } });
    }
  } catch (error) {
    console.error('Check nickname error:', error);
    res.status(500).json({ error: 'Failed to check nickname availability' });
  }
});

// Check nickname availability endpoint (authenticated version)
app.get('/api/user/check-nickname/:nickname', authenticateUser, async (req, res) => {
  try {
    const { nickname } = req.params;
    
    if (!nickname) {
      return res.status(400).json({ error: 'Nickname is required' });
    }

    console.log(`🔍 [AUTH] Checking nickname availability for: "${nickname}" (user: ${req.userId})`);

    // Check if nickname exists (excluding current user)
    const existingUser = await dbService.getUserByNickname(nickname);
    
    if (existingUser && existingUser.id !== req.userId) {
      console.log(`❌ [AUTH] Nickname "${nickname}" is already taken by user: ${existingUser.email}`);
      res.json({ data: { available: false, message: 'Nickname already taken' } });
    } else {
      console.log(`✅ [AUTH] Nickname "${nickname}" is available for user: ${req.userId}`);
      res.json({ data: { available: true, message: 'Nickname available' } });
    }
  } catch (error) {
    console.error('Check nickname error:', error);
    res.status(500).json({ error: 'Failed to check nickname availability' });
  }
});

// LLM config endpoints
app.get('/api/user/llm-config', authenticateUser, async (req, res) => {
  try {
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ data: { 
      llmConfig: user.llm_config,
      savedAgents: user.saved_agents 
    } });
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

        res.json({ data: { 
      message: 'LLM config updated successfully',
      llmConfig: updatedUser.llm_config,
      savedAgents: updatedUser.saved_agents
    } });
  } catch (error) {
    console.error('Update LLM config error:', error);
    res.status(500).json({ error: 'Failed to update LLM config' });
  }
});

// Create trip in users table trips column
app.post('/api/user/trips', authenticateUser, async (req, res) => {
  try {
    const { name, destination, summary, share_type, start_date, end_date, local_trip_id, owner_id, budget, itinerary, tips, suggestions, traveler_profile, numberOfTravelers } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Trip name is required' });
    }
    
    console.log(`🔄 Creating trip "${name}" for user ${req.userId}`);
    console.log(`📝 Trip data:`, JSON.stringify(req.body, null, 2));
    
    // Get current user to access existing trips
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Prepare new trip data
    const newTrip = {
      id: `trip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      destination: destination || '',
      summary: summary || '',
      share_type: share_type || 'private',
      start_date: start_date || null,
      end_date: end_date || null,
      local_trip_id: local_trip_id || null,
      owner_id: owner_id || req.userId,
      budget: budget || { total: 0, spent: 0, currency: 'USD' },
      itinerary: itinerary || [],
      tips: tips || [],
      suggestions: suggestions || [],
      traveler_profile: traveler_profile || {},
      // Store numberOfTravelers at the root level as requested
      numberOfTravelers: numberOfTravelers || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Get existing trips and add new trip
    const existingTrips = user.trips || [];
    const updatedTrips = [...existingTrips, newTrip];
    
    console.log(`📊 User currently has ${existingTrips.length} trips, adding new trip`);
    
    // Update user's trips column in database
    const updatedUser = await dbService.updateUser(user.email, { trips: updatedTrips });
    
    console.log(`✅ Trip "${name}" saved successfully to user's trips column`);
    console.log(`📊 User now has ${updatedTrips.length} trips`);
    
    res.status(201).json({ 
      data: { 
        trip: newTrip,
        message: 'Trip saved successfully',
        totalTrips: updatedTrips.length
      } 
    });
    
  } catch (error) {
    console.error('❌ Error creating trip:', error);
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

// Update trip in users table trips column
app.put('/api/user/trips/:tripId', authenticateUser, async (req, res) => {
  try {
    const { tripId } = req.params;
    const updates = req.body;
    
    console.log(`🔄 Updating trip ${tripId} for user ${req.userId}`);
    console.log(`📝 Update data:`, JSON.stringify(updates, null, 2));
    
    // Get current user from database
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      console.log(`❌ User not found: ${req.userId}`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log(`✅ Found user: ${user.email}`);
    console.log(`📊 User currently has ${user.trips?.length || 0} trips`);
    
    // Use the database service method to update the trip
    const updatedTrip = await dbService.updateUserTrip(req.userId, tripId, updates);
    
    console.log(`✅ Trip "${updatedTrip.name}" updated successfully for user ${user.email}`);
    
    res.json({ 
      data: { 
        message: 'Trip updated successfully',
        trip: updatedTrip
      } 
    });
    
  } catch (error) {
    console.error('❌ Error updating trip:', error);
    
    // Provide more specific error messages
    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }
    if (error.message === 'Trip not found') {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    res.status(500).json({ error: 'Failed to update trip' });
  }
});

// Delete trip from users table trips column
app.delete('/api/user/trips/:tripId', authenticateUser, async (req, res) => {
  try {
    const { tripId } = req.params;
    
    console.log(`🗑️ Deleting trip ${tripId} for user ${req.userId}`);
    
    // Get current user from database
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      console.log(`❌ User not found: ${req.userId}`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log(`✅ Found user: ${user.email}`);
    console.log(`📊 User currently has ${user.trips?.length || 0} trips`);
    
    // Use the database service method to delete the trip
    const deletedTrip = await dbService.deleteUserTrip(req.userId, tripId);
    
    console.log(`✅ Trip "${deletedTrip.name}" deleted successfully from user ${user.email}`);
    
    // Get updated user to confirm deletion
    const updatedUser = await dbService.getUserById(req.userId);
    console.log(`📊 User now has ${updatedUser.trips?.length || 0} trips`);
    
    res.json({ 
      data: { 
        message: 'Trip deleted successfully',
        deletedTrip: {
          id: deletedTrip.id,
          name: deletedTrip.name,
          destination: deletedTrip.destination
        },
        remainingTrips: updatedUser.trips?.length || 0
      } 
    });
    
  } catch (error) {
    console.error('❌ Error deleting trip:', error);
    
    // Provide more specific error messages
    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }
    if (error.message === 'Trip not found') {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

// Test endpoint to verify share type updates
app.put('/api/test-share-type/:tripId', authenticateUser, async (req, res) => {
  try {
    const { tripId } = req.params;
    const { shareType } = req.body;
    
    console.log(`🧪 Testing share type update for trip ${tripId}`);
    console.log(`📝 Share type to set: ${shareType}`);
    
    // Get current user and trip
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const currentTrip = user.trips?.find(trip => trip.id === tripId);
    if (!currentTrip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    console.log(`📊 Current trip share type: ${currentTrip.share_type || 'undefined'}`);
    
    // Update only the share type
    const updatedTrip = await dbService.updateUserTrip(req.userId, tripId, { shareType });
    
    console.log(`✅ Trip updated successfully`);
    console.log(`📊 New share type: ${updatedTrip.share_type}`);
    
    res.json({ 
      data: { 
        message: 'Share type test successful',
        tripId,
        oldShareType: currentTrip.share_type || 'undefined',
        newShareType: updatedTrip.share_type,
        trip: updatedTrip
      } 
    });
    
  } catch (error) {
    console.error('❌ Share type test error:', error);
    res.status(500).json({ error: 'Share type test failed' });
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

// Enhanced search endpoint for users and communities
app.get('/api/search', authenticateUser, async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    console.log(`🔍 Search query: "${q}"`);
    
    if (!q || q.length < 2) {
      console.log(`⚠️ Search query too short: "${q}"`);
      return res.json({ data: { users: [], communities: [] } });
    }

    // Search users and communities using database service
    const [matchedUsers, matchedCommunities] = await Promise.all([
      dbService.searchUsers(q),
      dbService.searchCommunities(q)
    ]);

    console.log(`🔍 Found ${matchedUsers.length} users and ${matchedCommunities.length} communities`);

    // Format user results with complete travelerProfile data
    const formattedUsers = matchedUsers.map(user => {
      const travelerProfile = user.traveler_profile || {};
      return {
          id: user.id,
        name: travelerProfile.name || user.name || 'Unknown User',
          email: user.email,
        nickname: travelerProfile.nickname || user.name || 'Unknown User',
        photo: travelerProfile.photo || null,
        travelerProfile: {
          name: travelerProfile.name || user.name || '',
          nickname: travelerProfile.nickname || '',
          birthday: travelerProfile.birthday || null,
          photo: travelerProfile.photo || null,
          age: travelerProfile.age || 0,
          // Ensure interests field is properly populated (not from activities)
          interests: Array.isArray(travelerProfile.interests) ? travelerProfile.interests : [],
          dietaryRestrictions: Array.isArray(travelerProfile.dietaryRestrictions) ? travelerProfile.dietaryRestrictions : [],
          accessibilityNeeds: Array.isArray(travelerProfile.accessibilityNeeds) ? travelerProfile.accessibilityNeeds : [],
          numberOfTravelers: travelerProfile.numberOfTravelers || 0
        }
      };
    });
    
    console.log(`🎯 Search results - Users with interests:`, formattedUsers.map(u => ({
      name: u.name,
      nickname: u.nickname,
      interests: u.travelerProfile.interests
    })));

    // Format community results
    const formattedCommunities = matchedCommunities.map(community => ({
      id: community.id,
      name: community.name,
      description: community.description,
      createdBy: community.created_by,
      members: community.members || [],
      memberCount: community.members ? community.members.length : 0,
      createdAt: community.created_at
    }));

    console.log(`✅ Search completed successfully`);
    res.json({ data: { users: formattedUsers, communities: formattedCommunities } });
  } catch (error) {
    console.error('❌ Search error:', error);
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

// Join community endpoint
app.post('/api/communities/:communityId/join', authenticateUser, async (req, res) => {
  try {
    const { communityId } = req.params;
    const userId = req.userId;
    
    const result = await dbService.joinCommunity(userId, communityId);
    res.json({ data: { message: 'Successfully joined community', community: result } });
  } catch (error) {
    console.error('Join community error:', error);
    res.status(500).json({ error: 'Failed to join community' });
  }
});

// Leave community endpoint
app.post('/api/communities/:communityId/leave', authenticateUser, async (req, res) => {
  try {
    const { communityId } = req.params;
    const userId = req.userId;
    
    const result = await dbService.leaveCommunity(userId, communityId);
    res.json({ data: { message: 'Successfully left community', community: result } });
  } catch (error) {
    console.error('Leave community error:', error);
    res.status(500).json({ error: 'Failed to leave community' });
  }
});

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
    res.status(201).json({ data: { message: 'Community created', community: savedCommunity } });
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
    
    // Enrich posts with complete user details
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
              userName: commentUser?.traveler_profile?.name || commentUser?.name || comment.userNickname || 'Anonymous',
              userNickname: commentUser?.traveler_profile?.nickname || comment.userNickname,
              userPhoto: commentUser?.traveler_profile?.photo || comment.userPhoto,
              likes: Array.isArray(comment.likes) ? comment.likes : [],
            };
          }
          return comment;
        }));
      }
      
      // Ensure complete author information from travelerProfile
      const authorInfo = user ? {
        id: user.id,
        name: user.traveler_profile?.name || user.name || 'Unknown User',
        nickname: user.traveler_profile?.nickname || user.name || 'Unknown User',
        photo: user.traveler_profile?.photo || null,
        email: user.email
      } : {
        id: 'unknown',
        name: 'Unknown User',
        nickname: 'Unknown User',
        photo: null,
        email: null
      };
      
      console.log(`🎯 Post author info:`, JSON.stringify(authorInfo, null, 2));
      
      // Process connected POI data if present
      let connectedPOIData = null;
      
      // DEBUG: Log the raw connected_poi data to see what we're getting
      console.log(`🔍 Raw connected_poi data for post ${post.id}:`, {
        value: post.connected_poi,
        type: typeof post.connected_poi,
        isObject: typeof post.connected_poi === 'object',
        isString: typeof post.connected_poi === 'string',
        isNull: post.connected_poi === null,
        isUndefined: post.connected_poi === undefined
      });
      
      if (post.connected_poi) {
        let poi = post.connected_poi;
        
        // Handle case where connected_poi might be a string (JSONB parsing issue)
        if (typeof poi === 'string') {
          try {
            console.log('🔄 Parsing string POI data:', poi);
            poi = JSON.parse(poi);
            console.log('✅ Successfully parsed POI string to object:', poi);
          } catch (parseError) {
            console.error('❌ Failed to parse POI string:', parseError);
            console.error('❌ Raw string data:', poi);
            poi = null;
          }
        }
        
        // Now check if we have a valid POI object
        if (poi && typeof poi === 'object' && poi !== null) {
          // CRITICAL: Validate that POI ID is present
          if (!poi.id) {
            console.error('🚨 CRITICAL: POI ID missing in post data:', JSON.stringify(poi, null, 2));
            console.error('🚨 Post ID:', post.id, 'User ID:', post.user_id);
            
            // Generate a fallback ID to prevent frontend errors
            const fallbackId = `poi_fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log('🔧 Generated fallback POI ID:', fallbackId);
            
            connectedPOIData = {
              id: fallbackId,  // ← CRITICAL: Ensure ID is always present
              name: poi.name || 'Unknown POI',
              description: poi.description || '',
              coordinates: poi.coordinates || poi.location || null,
              photo: poi.photo || null,
              icon: poi.icon || '',
              type: poi.type || 'public',
              author: poi.author || '',
              user_id: poi.user_id
            };
          } else {
            connectedPOIData = {
              id: poi.id,  // ← CRITICAL: Use existing POI ID
              name: poi.name || '',
              description: poi.description || '',
              coordinates: poi.coordinates || poi.location || null,
              photo: poi.photo || null,
              icon: poi.icon || '',
              type: poi.type || 'public',
              author: poi.author || '',
              user_id: poi.user_id
            };
            console.log('✅ Post connected POI data with ID:', poi.id);
          }
          
          console.log('📍 Complete POI data for frontend:', JSON.stringify(connectedPOIData, null, 2));
        } else {
          console.log('⚠️ Invalid POI data structure:', poi);
        }
      }

          return {
        ...post,
        comments: enrichedComments,
        commentCount: enrichedComments.length,
        likeCount: post.like_count || 0,
        author: authorInfo,
        connectedPOI: connectedPOIData
      };
    }));

    // Sort by creation date (newest first)
    enrichedPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    console.log(`📝 Returning ${enrichedPosts.length} posts with enriched author data`);
    const normalizedPosts = enrichedPosts.map(p => ({
      ...p,
      // Map to camelCase for frontend consistency
      createdAt: p.created_at ?? null
    }));
    res.json({ data: { posts: normalizedPosts } });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Failed to get posts' });
  }
});

// Test endpoint to verify POI ID handling in posts
app.get('/api/test-poi-ids', async (req, res) => {
  try {
    console.log('🧪 Testing POI ID handling in posts...');
    
    const posts = await dbService.getAllPosts();
    
    // Enhanced filtering to handle both object and string POI data
    const postsWithPOI = posts.filter(post => {
      if (!post.connected_poi) return false;
      
      // Handle string POI data (JSONB parsing issue)
      if (typeof post.connected_poi === 'string') {
        try {
          const parsed = JSON.parse(post.connected_poi);
          return typeof parsed === 'object' && parsed !== null;
        } catch (error) {
          console.log('⚠️ Post has invalid POI string data:', post.id, post.connected_poi);
          return false;
        }
      }
      
      return typeof post.connected_poi === 'object' && post.connected_poi !== null;
    });
    
    console.log(`📊 Found ${postsWithPOI.length} posts with connected POIs`);
    
    const poiIdAnalysis = postsWithPOI.map(post => {
      let poi = post.connected_poi;
      
      // Parse string POI data if needed
      if (typeof poi === 'string') {
        try {
          poi = JSON.parse(poi);
        } catch (error) {
          console.error('❌ Failed to parse POI string in test:', error);
          return {
            postId: post.id,
            poiId: null,
            hasId: false,
            idType: 'parse_error',
            poiName: 'Parse Error',
            poiDescription: 'Failed to parse POI data'
          };
        }
      }
      
      const hasId = !!poi.id;
      const idType = typeof poi.id;
      const idValue = poi.id;
      
      if (!hasId) {
        console.error('🚨 Post missing POI ID:', {
          postId: post.id,
          poiData: poi
        });
      }
      
      return {
        postId: post.id,
        poiId: idValue,
        hasId,
        idType,
        poiName: poi.name || 'No name',
        poiDescription: poi.description || 'No description'
      };
    });
    
    const missingIds = poiIdAnalysis.filter(item => !item.hasId);
    const validIds = poiIdAnalysis.filter(item => item.hasId);
    
    console.log(`✅ Posts with valid POI IDs: ${validIds.length}`);
    console.log(`❌ Posts missing POI IDs: ${missingIds.length}`);
    
    if (missingIds.length > 0) {
      console.error('🚨 Posts missing POI IDs:', missingIds);
    }
    
    res.json({
      data: {
        message: 'POI ID analysis complete',
        totalPostsWithPOI: postsWithPOI.length,
        validPOIIds: validIds.length,
        missingPOIIds: missingIds.length,
        analysis: poiIdAnalysis,
        sampleValidPost: validIds[0] || null,
        sampleMissingPost: missingIds[0] || null,
        recommendation: missingIds.length > 0 ? 'Run /api/fix-poi-strings to fix string POI data' : 'All POI data is properly formatted'
      }
    });
    
  } catch (error) {
    console.error('❌ POI ID test error:', error);
    res.status(500).json({ error: 'POI ID test failed' });
  }
});

// Fix endpoint to convert string POI data back to objects
app.post('/api/fix-poi-strings', async (req, res) => {
  try {
    console.log('🔧 Starting POI string data fix...');
    
    const posts = await dbService.getAllPosts();
    const postsWithStringPOI = posts.filter(post => 
      post.connected_poi && typeof post.connected_poi === 'string'
    );
    
    console.log(`📊 Found ${postsWithStringPOI.length} posts with string POI data`);
    
    let fixedCount = 0;
    let errorCount = 0;
    
    for (const post of postsWithStringPOI) {
      try {
        console.log(`🔧 Fixing post ${post.id} with string POI data`);
        
        // Parse the string POI data
        const parsedPOI = JSON.parse(post.connected_poi);
        
        // Ensure POI ID is present
        if (!parsedPOI.id) {
          const generatedId = `poi_fix_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          parsedPOI.id = generatedId;
          console.log(`🔧 Generated POI ID for post ${post.id}:`, generatedId);
        }
        
        // Update the post with proper object data
        await dbService.updatePost(post.id, { connected_poi: parsedPOI });
        
        console.log(`✅ Fixed post ${post.id} - converted string to object`);
        fixedCount++;
        
      } catch (error) {
        console.error(`❌ Failed to fix post ${post.id}:`, error);
        errorCount++;
      }
    }
    
    console.log(`🎉 POI string fix complete! Fixed: ${fixedCount}, Errors: ${errorCount}`);
    
    res.json({
      data: {
        message: 'POI string data fix complete',
        totalPostsProcessed: postsWithStringPOI.length,
        fixedCount,
        errorCount,
        recommendation: errorCount > 0 ? 'Some posts could not be fixed automatically' : 'All POI string data has been converted to objects'
      }
    });
    
  } catch (error) {
    console.error('❌ POI string fix error:', error);
    res.status(500).json({ error: 'POI string fix failed' });
  }
});

// Update post endpoint
app.put('/api/posts/:postId', authenticateUser, async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, location, connected_poi, connectedPOI } = req.body;
    
    // Get the post to check ownership
    const existingPost = await dbService.getPostById(postId);
    if (!existingPost) {
      return res.status(404).json({ error: 'Post not found' });
    }
    
    // Check if user owns the post
    if (existingPost.user_id !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to update this post' });
    }
    
    // Handle connected POI data updates
    let connectedPOIData = existingPost.connected_poi;
    if (connected_poi !== undefined || connectedPOI !== undefined) {
      const poiData = connected_poi || connectedPOI;
      
      if (poiData === null) {
        // Remove POI connection
        connectedPOIData = null;
      } else if (typeof poiData === 'object' && poiData !== null) {
        // CRITICAL: Ensure POI ID is always present when updating
        const poiId = poiData.id || existingPost.connected_poi?.id || `poi_update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Update with new POI data
        connectedPOIData = {
          id: poiId,  // ← CRITICAL: Always include POI ID
          name: poiData.name || existingPost.connected_poi?.name || '',
          description: poiData.description || existingPost.connected_poi?.description || '',
          coordinates: poiData.coordinates || poiData.location || existingPost.connected_poi?.coordinates || null,
          photo: poiData.photo || (poiData.photos && Array.isArray(poiData.photos) ? poiData.photos[0] : null) || existingPost.connected_poi?.photo || null,
          icon: poiData.icon || existingPost.connected_poi?.icon || '',
          type: poiData.type || existingPost.connected_poi?.type || 'public',
          author: poiData.author || existingPost.connected_poi?.author || '',
          user_id: poiData.user_id || existingPost.connected_poi?.user_id || req.userId
        };
        console.log('📍 Updating post with new POI data, preserving ID:', poiId);
        console.log('📍 Complete updated POI data:', JSON.stringify(connectedPOIData, null, 2));
      }
    }
    
    // Prepare update data
    const updateData = {
      content: content !== undefined ? content : existingPost.content,
      location: location !== undefined ? location : existingPost.location,
      connected_poi: connectedPOIData
    };
    
    // Update the post
    const updatedPost = await dbService.updatePost(postId, updateData);
    
    console.log('📝 Post updated successfully:', updatedPost);
    
    res.json({ 
      data: { 
        post: {
          ...updatedPost,
          connectedPOI: updatedPost.connected_poi,
          createdAt: updatedPost.created_at
        },
        message: 'Post updated successfully'
      } 
    });
    
  } catch (error) {
    console.error('❌ Error updating post:', error);
    res.status(500).json({ error: 'Failed to update post' });
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
      shareType = 'private',
      numberOfTravelers
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
      // Store numberOfTravelers at the root level as requested
      numberOfTravelers: numberOfTravelers || null,
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
      // Include numberOfTravelers at the root level
      numberOfTravelers: savedTrip.numberOfTravelers || null,
      createdAt: savedTrip.created_at,
      updatedAt: savedTrip.updated_at,
      shareType: savedTrip.share_type,
    });

    await dbService.updateUser(user.email, { trips: userTrips });

    res.json({ data: { trip: savedTrip } });
  } catch (error) {
    console.error('Create trip error:', error);
    res.status(500).json({ error: 'Failed to create trip' });
  }
});

app.get('/api/trips', authenticateUser, async (req, res) => {
  try {
    const userTrips = await dbService.getUserTrips(req.userId);
    res.json({ trips: userTrips });
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
          shareType: updated.share_type,
        };
        await dbService.updateUser(user.email, { trips: user.trips });
      }
    }
    
    res.json({ data: { trip: updated } });
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
    
    res.json({ data: { success: true } });
  } catch (error) {
    console.error('Delete trip error:', error);
    res.status(500).json({ error: 'Failed to delete trip' });
  }
});

app.post('/api/posts', authenticateUser, async (req, res) => {
  try {
    const { content, location, connected_poi, connectedPOI } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Post content is required' });
    }

    const user = await dbService.getUserById(req.userId);
    if (!user) {
      console.error('❌ User not found for ID:', req.userId);
      return res.status(401).json({ error: 'User not found' });
    }
    
    console.log('👤 User found:', { id: user.id, email: user.email, name: user.name });
    
    // Ensure user ID is properly formatted as string
    const userId = String(user.id);
    console.log('🆔 Using user ID:', userId);
    console.log('🆔 User ID type:', typeof userId);

    // Handle connected POI data - accept full POI object or existing POI ID
    let connectedPOIData = null;
    if (connected_poi || connectedPOI) {
      const poiData = connected_poi || connectedPOI;
      
      // If it's a full POI object, store it directly
      if (typeof poiData === 'object' && poiData !== null) {
        // CRITICAL: Ensure POI ID is always present
        const poiId = poiData.id || `poi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        connectedPOIData = {
          id: poiId,  // ← CRITICAL: Always include POI ID
          name: poiData.name || '',
          description: poiData.description || '',
          coordinates: poiData.coordinates || poiData.location || null,
          photo: poiData.photo || (poiData.photos && Array.isArray(poiData.photos) ? poiData.photos[0] : null),
          icon: poiData.icon || '',
          type: poiData.type || 'public',
          author: poiData.author || user.traveler_profile?.nickname || user.name || '',
          user_id: poiData.user_id || user.id
        };
        console.log('📍 Storing full POI object in post with ID:', poiId);
        console.log('📍 Complete POI data:', JSON.stringify(connectedPOIData, null, 2));
      } else {
        // If it's just a string/ID, try to fetch the POI data
        try {
          const existingPOI = await dbService.getPOIById(poiData);
          if (existingPOI) {
            connectedPOIData = {
              id: existingPOI.id,  // ← CRITICAL: Use existing POI ID
              name: existingPOI.name,
              description: existingPOI.description,
              coordinates: existingPOI.location,
              photo: existingPOI.photos && Array.isArray(existingPOI.photos) ? existingPOI.photos[0] : null,
              icon: existingPOI.icon,
              type: existingPOI.type,
              author: existingPOI.author,
              user_id: existingPOI.user_id
            };
            console.log('📍 Fetched existing POI data for post with ID:', existingPOI.id);
            console.log('📍 Complete POI data:', JSON.stringify(connectedPOIData, null, 2));
          }
        } catch (error) {
          console.log('⚠️ Could not fetch POI data, creating new POI reference with ID');
          // Create a new POI reference with generated ID
          const generatedPoiId = `poi_ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          connectedPOIData = { 
            id: generatedPoiId,  // ← CRITICAL: Generate ID for reference
            reference: poiData,
            name: 'Referenced POI',
            type: 'reference'
          };
        }
      }
    }

    const post = {
      userId: String(userId), // Ensure userId is always a string
      content,
      location: location || '',
      connectedPOI: connectedPOIData,
      likes: [],
      comments: [],
      createdAt: new Date().toISOString(),
    };
    
    console.log('📝 Post data before database save:', JSON.stringify(post, null, 2));
    console.log('📝 UserId type in post:', typeof post.userId);

    // Store post in database
    console.log('📝 Creating post with data:', JSON.stringify(post, null, 2));
    const savedPost = await dbService.createPost(post);
    console.log('✅ Post created successfully:', savedPost);

    // Update user's posts list
    const userPosts = user.posts || [];
    userPosts.push({
      id: savedPost.id,
      content: savedPost.content,
      location: savedPost.location,
      connectedPOI: savedPost.connected_poi,
      author: { 
        id: userId, 
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
    const responsePost = {
      ...savedPost,
      // Map to camelCase for frontend consistency
      connectedPOI: savedPost.connected_poi || connectedPOIData,
      createdAt: savedPost.created_at ?? post.createdAt
    };
    res.status(201).json({ data: { post: responsePost } });
  } catch (error) {
    console.error('❌ Error creating post:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Tripyy POI endpoints
app.get('/api/pois', async (req, res) => {
  try {
    const pois = await dbService.getAllPOIs();
    
    // Transform POI data to match frontend expectations
    const transformedPois = pois.map(poi => {
      const loc = poi.location || {};
      const lat = typeof loc.lat === 'number' ? loc.lat : (typeof loc.latitude === 'number' ? loc.latitude : null);
      const lng = typeof loc.lng === 'number' ? loc.lng : (typeof loc.longitude === 'number' ? loc.longitude : null);
      return {
        id: poi.id,
        name: poi.name ?? null,
        description: poi.description ?? null,
        // Always include coordinates with {lat, lng}
        coordinates: lat != null && lng != null ? { lat, lng } : null,
        // Provide photo as first photo if present
        photo: poi.photos && Array.isArray(poi.photos) && poi.photos.length > 0 ? poi.photos[0] : null,
        icon: poi.icon ?? null,
        type: poi.type ?? null,
        author: poi.author ?? null,
        user: {
          id: poi.user_id ?? null,
          email: poi.user_email || '',
          name: poi.user_name || poi.author || ''
        },
        // Map to camelCase for frontend consistency
        createdAt: poi.created_at ?? null,
        reviews: poi.reviews || [],
        averageRating: poi.average_rating ?? 0,
        reviewCount: poi.review_count ?? 0
      };
    });
    
    console.log(`📍 Returning ${transformedPois.length} POIs with transformed data structure`);
    console.log('📍 Sample POI data:', transformedPois[0]);
    
    res.json({ data: { pois: transformedPois } });
  } catch (error) {
    console.error('Get POIs error:', error);
    res.status(500).json({ error: 'Failed to get POIs' });
  }
});

app.post('/api/pois', authenticateUser, async (req, res) => {
  try {
    const { name, icon, description, photo, type, author } = req.body || {};
    // Accept both { coordinates: {lat,lng} } and { location: {latitude, longitude} } or { location: {lat,lng} }
    const bodyCoords = req.body?.coordinates;
    const bodyLoc = req.body?.location;
    let lat = null;
    let lng = null;
    if (bodyCoords && typeof bodyCoords.lat === 'number' && typeof bodyCoords.lng === 'number') {
      lat = bodyCoords.lat;
      lng = bodyCoords.lng;
    } else if (bodyLoc) {
      if (typeof bodyLoc.lat === 'number' && typeof bodyLoc.lng === 'number') {
        lat = bodyLoc.lat; lng = bodyLoc.lng;
      } else if (typeof bodyLoc.latitude === 'number' && typeof bodyLoc.longitude === 'number') {
        lat = bodyLoc.latitude; lng = bodyLoc.longitude;
      }
    }
    if (!name || typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'Name and valid coordinates are required' });
    }
    
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Map frontend data structure to backend database structure
    // Persist both coordinates and location {lat,lng} for backward compatibility
    const locationPayload = { lat, lng, coordinates: { lat, lng }, latitude: lat, longitude: lng };
    const poi = {
      name,
      location: locationPayload,
      photos: photo ? [photo] : [],
      icon: icon || '',
      type: type || 'public',
      author: author || user.traveler_profile?.nickname || user.name || '',
      userId: String(user.id), // Ensure userId is converted to string
      reviews: [],
      averageRating: 0,
      reviewCount: 0,
      likes: [],
      likeCount: 0,
      createdAt: new Date().toISOString(),
      description: description || ''
    };

    console.log('📍 Creating POI with data:', poi);

    // Store POI in database
    const savedPoiId = await dbService.createPOI(poi);
    
    // Get the created POI to return
    const savedPoi = await dbService.getPOIById(savedPoiId);
    // Normalize response to include coordinates at top-level
    const loc = savedPoi.location || {};
    const respLat = typeof loc.lat === 'number' ? loc.lat : (typeof loc.latitude === 'number' ? loc.latitude : null);
    const respLng = typeof loc.lng === 'number' ? loc.lng : (typeof loc.longitude === 'number' ? loc.longitude : null);
    const responsePoi = {
      id: savedPoi.id,
      name: savedPoi.name ?? null,
      description: savedPoi.description ?? null,
      coordinates: respLat != null && respLng != null ? { lat: respLat, lng: respLng } : null,
      photo: savedPoi.photos && Array.isArray(savedPoi.photos) && savedPoi.photos.length > 0 ? savedPoi.photos[0] : null,
      icon: savedPoi.icon ?? null,
      type: savedPoi.type ?? null,
      author: savedPoi.author ?? null,
      user: { id: savedPoi.user_id ?? null },
      // Map to camelCase for frontend consistency
      createdAt: savedPoi.created_at ?? null,
      reviews: savedPoi.reviews || [],
      averageRating: savedPoi.average_rating ?? 0,
      reviewCount: savedPoi.review_count ?? 0,
      likes: savedPoi.likes ? JSON.parse(savedPoi.likes) : [],
      likeCount: savedPoi.like_count ?? 0
    };
    
    console.log('📍 New POI added with ID:', savedPoiId);
    res.status(201).json({ data: { poi: responsePoi } });
  } catch (error) {
    console.error('❌ Error adding POI:', error);
    res.status(500).json({ error: 'Failed to add POI' });
  }
});

// Like/unlike a POI
app.post('/api/pois/:poiId/like', authenticateUser, async (req, res) => {
  try {
    const { poiId } = req.params;
    
    // Get user info to get their nickname
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const userNickname = user.traveler_profile?.nickname || user.name || 'Unknown User';
    
    // Toggle like status
    const updatedPoi = await dbService.togglePOILike(poiId, userNickname);
    
    // Parse likes array from JSON safely
    let likes = [];
    if (updatedPoi.likes) {
      try {
        if (typeof updatedPoi.likes === 'string') {
          console.log('🔍 Parsing likes string:', updatedPoi.likes);
          likes = JSON.parse(updatedPoi.likes);
        } else {
          likes = updatedPoi.likes;
        }
      } catch (error) {
        console.error('Error parsing likes:', error);
        console.error('Likes value:', updatedPoi.likes);
        console.error('Likes type:', typeof updatedPoi.likes);
        likes = [];
      }
    }
    
    // Parse photos and reviews safely
    let photos = [];
    if (updatedPoi.photos) {
      try {
        photos = typeof updatedPoi.photos === 'string' ? JSON.parse(updatedPoi.photos) : updatedPoi.photos;
      } catch (error) {
        console.error('Error parsing photos:', error);
        photos = [];
      }
    }

    let reviews = [];
    if (updatedPoi.reviews) {
      try {
        reviews = typeof updatedPoi.reviews === 'string' ? JSON.parse(updatedPoi.reviews) : updatedPoi.reviews;
      } catch (error) {
        console.error('Error parsing reviews:', error);
        reviews = [];
      }
    }

    // Format response
    const responsePoi = {
      id: updatedPoi.id.toString(),
      name: updatedPoi.name,
      description: updatedPoi.description,
      location: updatedPoi.location,
      photos: photos,
      icon: updatedPoi.icon,
      type: updatedPoi.type,
      author: updatedPoi.author,
      user_id: updatedPoi.user_id,
      reviews: reviews,
      average_rating: updatedPoi.average_rating,
      review_count: updatedPoi.review_count,
      likes: likes,
      likeCount: updatedPoi.like_count,
      created_at: updatedPoi.created_at
    };

    res.json({
      success: true,
      poi: responsePoi
    });
  } catch (error) {
    console.error('❌ Error toggling POI like:', error);
    if (error.message === 'POI not found') {
      return res.status(404).json({ error: 'POI not found' });
    }
    res.status(500).json({ error: 'Failed to toggle POI like' });
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
    return res.json({ data: { message: 'POI updated', poi: updatedPoi } });
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

    return res.json({ data: { message: 'POI deleted', poi: deleted } });
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
      likes: [],
      likeCount: 0
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

// Like/unlike a POI review
app.post('/api/pois/review/:reviewId/like', authenticateUser, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { poiId } = req.body; // POI ID is required to find the review
    
    if (!poiId) {
      return res.status(400).json({ error: 'POI ID is required' });
    }
    
    // Get user info to get their nickname
    const user = await dbService.getUserById(req.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const userNickname = user.traveler_profile?.nickname || user.name || 'Unknown User';
    
    // Toggle like status
    const updatedReview = await dbService.toggleReviewLike(poiId, reviewId, userNickname);
    
    res.json({
      success: true,
      review: updatedReview
    });
  } catch (error) {
    console.error('❌ Error toggling review like:', error);
    if (error.message === 'POI not found') {
      return res.status(404).json({ error: 'POI not found' });
    }
    if (error.message === 'Review not found') {
      return res.status(404).json({ error: 'Review not found' });
    }
    res.status(500).json({ error: 'Failed to toggle review like' });
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
    
    // Send notification if post was liked (not unliked) and not by the author
    if (likeIndex === -1 && foundPost.user_id !== req.userId) {
      try {
        const notification = {
          type: 'post_like',
          title: '❤️ Post Liked',
          body: `${userNickname} liked your post: "${foundPost.content ? foundPost.content.substring(0, 50) + (foundPost.content.length > 50 ? '...' : '') : 'Your post'}"`,
          data: { 
            type: 'post_like', 
            likedBy: userNickname, 
            postContent: foundPost.content,
            postId: postId
          }
        };
        
        // Send notification using the internal function
        await sendNotificationToUser(foundPost.user_id, notification);
        console.log(`📱 Post like notification sent to user ${foundPost.user_id}`);
      } catch (error) {
        console.error('❌ Error sending post like notification:', error);
      }
    }
    
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
    
    // Send notification if comment was liked (not unliked) and not by the comment author
    if (idx === -1 && comment.userId !== req.userId) {
      try {
        const notification = {
          type: 'comment_like',
          title: '❤️ Comment Liked',
          body: `${nickname} liked your comment: "${comment.text ? comment.text.substring(0, 50) + (comment.text.length > 50 ? '...' : '') : 'Your comment'}"`,
          data: { 
            type: 'comment_like', 
            likedBy: nickname, 
            commentContent: comment.text,
            postId: postId,
            commentId: commentId
          }
        };
        
        // Send notification using the internal function
        await sendNotificationToUser(comment.userId, notification);
        console.log(`📱 Comment like notification sent to user ${comment.userId}`);
      } catch (error) {
        console.error('❌ Error sending comment like notification:', error);
      }
    }
    
    res.json({ data: { success: true, post: updatedPost } });
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
        const reviews = typeof poi.reviews === 'string' ? JSON.parse(poi.reviews) : poi.reviews;
        const review = reviews.find(r => r.id === reviewId);
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
    const reviews = typeof foundPoi.reviews === 'string' ? JSON.parse(foundPoi.reviews) : foundPoi.reviews;
    await dbService.updatePOI(foundPoi.id, {
      reviews: reviews
    });
    
    // Send notification if review was liked (not unliked) and not by the review author
    if (likeIndex === -1 && foundReview.user_id !== req.userId) {
      try {
        const notification = {
          type: 'review_like',
          title: '❤️ Review Liked',
          body: `${userNickname} liked your review on ${foundPoi.name}: "${foundReview.text ? foundReview.text.substring(0, 50) + (foundReview.text.length > 50 ? '...' : '') : 'Your review'}"`,
          data: { 
            type: 'review_like', 
            likedBy: userNickname, 
            reviewContent: foundReview.text,
            poiName: foundPoi.name,
            poiId: foundPoi.id,
            reviewId: reviewId
          }
        };
        
        // Send notification using the internal function
        await sendNotificationToUser(foundReview.user_id, notification);
        console.log(`📱 Review like notification sent to user ${foundReview.user_id}`);
      } catch (error) {
        console.error('❌ Error sending review like notification:', error);
      }
    }
    
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

// User profile endpoint - enhanced with complete travelerProfile data
app.get('/api/user/profile/:userId', authenticateUser, async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`👤 Getting profile for user/nickname: ${userId}`);
    
    // Try by ID first
    let user = await dbService.getUserById(userId);
    
    // If not found, try by nickname (strip leading @ if provided)
    if (!user) {
      const nickname = (userId || '').toString().replace(/^@/, '');
      console.log(`🔍 User not found by ID, trying nickname: ${nickname}`);
      
      // Search for user by nickname in database
      const allUsers = await dbService.searchUsers(nickname);
      user = allUsers.find(u => (u.traveler_profile?.nickname || '').toLowerCase() === nickname.toLowerCase());
      
      if (user) {
        console.log(`✅ Found user by nickname: ${user.email}`);
      }
    }
    
    if (!user) {
      console.log(`❌ User not found: ${userId}`);
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Ensure complete travelerProfile data with defaults
    const travelerProfile = user.traveler_profile || {};
    const completeProfile = {
      name: travelerProfile.name || user.name || '',
      nickname: travelerProfile.nickname || '',
      birthday: travelerProfile.birthday || null,
      photo: travelerProfile.photo || null,
      age: travelerProfile.age || 0,
      // Ensure interests field is properly populated (not from activities)
      interests: Array.isArray(travelerProfile.interests) ? travelerProfile.interests : [],
      dietaryRestrictions: Array.isArray(travelerProfile.dietaryRestrictions) ? travelerProfile.dietaryRestrictions : [],
      accessibilityNeeds: Array.isArray(travelerProfile.accessibilityNeeds) ? travelerProfile.accessibilityNeeds : [],
      numberOfTravelers: travelerProfile.numberOfTravelers || 0,
      // Include any other fields from traveler_profile
      ...travelerProfile
    };
    
    console.log(`🎯 Complete profile interests:`, JSON.stringify(completeProfile.interests, null, 2));
    
    // Return complete user profile data
    const profileData = {
      id: user.id,
      name: user.name,
      email: user.email,
      photo: completeProfile.photo,
      travelerProfile: completeProfile,
      createdAt: user.created_at,
      lastKnownLocation: user.last_known_location
    };
    
    console.log(`📝 Returning complete profile for user: ${user.email}`);
    res.json({ data: { user: profileData } });
  } catch (error) {
    console.error('❌ Error getting user profile:', error);
    res.status(500).json({ error: 'Failed to get user profile' });
  }
});

// User trips endpoint
app.get('/api/user/trips/:identifier', authenticateUser, async (req, res) => {
  try {
    const { identifier } = req.params;
    let userId = identifier;
    
    // If identifier is not a number, try to resolve by nickname
    if (isNaN(identifier)) {
      const userResult = await pool.query(
        'SELECT id FROM users WHERE traveler_profile->>\'nickname\' = $1',
        [identifier]
      );
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      userId = userResult.rows[0].id;
    }

    // Find user by ID
    const user = await dbService.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get user's trips from database
    const userTrips = await dbService.getUserTrips(userId);
    
    console.log(`📋 Getting trips for user ${userId}:`, userTrips.length, 'trips');
    
    res.json({ success: true, data: userTrips });
  } catch (error) {
    console.error('❌ Error getting user trips:', error);
    res.status(500).json({ error: 'Failed to get user trips' });
  }
});

// Removed duplicate user profile endpoint - using the enhanced version above

// Community leave endpoint
app.post('/api/communities/:communityId/leave', authenticateUser, async (req, res) => {
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

    // Remove user from community members
    const currentMembers = foundCommunity.members || [];
    const memberIndex = currentMembers.indexOf(user.id);
    if (memberIndex !== -1) {
      currentMembers.splice(memberIndex, 1);
    }
    
    // Update community in database
    const updatedCommunity = await dbService.updateCommunity(communityId, {
      members: currentMembers
    });
    
    console.log(`👥 User ${user.id} left community ${communityId}`);
    
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
    console.error('❌ Error leaving community:', error);
    res.status(500).json({ error: 'Failed to leave community' });
  }
});

// Conversation endpoints (stubs)
app.get('/api/conversations/:conversationId', authenticateUser, async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // Stub implementation - return basic conversation structure
    const conversation = {
      id: conversationId,
      participants: [req.userId],
      lastMessage: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    res.json({ data: { conversation } });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

app.get('/api/conversations/:conversationId/messages', authenticateUser, async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // Stub implementation - return empty messages array
    const messages = [];
    
    res.json({ data: { messages } });
  } catch (error) {
    console.error('Get conversation messages error:', error);
    res.status(500).json({ error: 'Failed to get conversation messages' });
  }
});

// ==================== REPORTING SYSTEM ENDPOINTS ====================

// Submit a report
app.post('/api/reports', authenticateUser, async (req, res) => {
  try {
    const { 
      targetType, 
      targetId, 
      targetName,
      targetContent,
      targetAuthor,
      issueType, 
      description 
    } = req.body;

    const reporterId = req.userId;
    
    // Get reporter's nickname from their profile
    let reporterNickname = '';
    try {
      const reporterProfile = await pool.query(
        'SELECT traveler_profile FROM users WHERE id = $1',
        [reporterId]
      );
      
      if (reporterProfile.rows.length > 0) {
        const travelerProfile = reporterProfile.rows[0].traveler_profile;
        if (travelerProfile && travelerProfile.nickname) {
          reporterNickname = travelerProfile.nickname;
        }
      }
    } catch (profileError) {
      console.log('Could not fetch reporter nickname:', profileError);
    }

    const result = await pool.query(
      `INSERT INTO reports (
        reporter_id, 
        target_type, 
        target_id, 
        target_name, 
        target_content, 
        target_author, 
        issue_type, 
        description, 
        reporter_nickname,
        status, 
        created_at, 
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', NOW(), NOW()) 
      RETURNING *`,
      [
        reporterId,
        targetType,
        targetId,
        targetName || null,
        targetContent || null,
        targetAuthor ? JSON.stringify(targetAuthor) : null,
        issueType,
        description,
        reporterNickname
      ]
    );

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to create report' 
    });
  }
});

// Get reports (admin only)
app.get('/api/reports', authenticateUser, async (req, res) => {
  try {
    // Check if user is admin
    const adminCheck = await pool.query(
      'SELECT * FROM admins WHERE user_id = $1 AND is_active = true',
      [req.userId]
    );

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Admin privileges required.' 
      });
    }

    const result = await pool.query(`
      SELECT 
        r.*,
        u.name as reporter_name,
        u.email as reporter_email,
        u.traveler_profile->>'nickname' as reporter_nickname
      FROM reports r
      LEFT JOIN users u ON r.reporter_id = u.id
      ORDER BY r.created_at DESC
    `);

    // Parse target_author JSON safely
    const reports = result.rows.map(report => {
      if (report.target_author) {
        try {
          if (typeof report.target_author === 'object') {
            report.target_author = report.target_author;
          } else {
            report.target_author = JSON.parse(report.target_author);
          }
        } catch (e) {
          console.log('Error parsing target_author:', e);
          report.target_author = null;
        }
      }
      return report;
    });

    res.json({
      success: true,
      data: { reports }
    });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch reports' 
    });
  }
});

// Update report status (admin only)
app.put('/api/reports/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;
    
    // Check if user is admin
    const isAdmin = await isUserAdmin(req.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Validate status
    const validStatuses = ['pending', 'reviewing', 'resolved', 'dismissed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    console.log('📝 Updating report:', { id, status, adminNotes });
    
    const updates = {
      status,
      adminNotes,
      reviewedBy: req.userId
    };
    
    const report = await dbService.updateReport(id, updates);
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    console.log('✅ Report updated:', report.id);
    
    // Handle target_author parsing safely
    let targetAuthor = null;
    if (report.target_author) {
      try {
        if (typeof report.target_author === 'object') {
          targetAuthor = report.target_author;
        } else {
          targetAuthor = JSON.parse(report.target_author);
        }
      } catch (error) {
        console.error('Error parsing target_author:', error);
        targetAuthor = null;
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Report updated successfully',
      report: {
        id: report.id,
        targetType: report.target_type,
        targetId: report.target_id,
        targetName: report.target_name,
        targetContent: report.target_content,
        targetAuthor: targetAuthor,
        issueType: report.issue_type,
        description: report.description,
        status: report.status,
        adminNotes: report.admin_notes,
        reviewedBy: report.reviewed_by,
        createdAt: report.created_at,
        updatedAt: report.updated_at
      }
    });
    
  } catch (error) {
    console.error('❌ Error updating report:', error);
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// Get specific report (admin only)
app.get('/api/reports/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user is admin
    const isAdmin = await isUserAdmin(req.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const report = await dbService.getReportById(id);
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    // Handle target_author parsing safely
    let targetAuthor = null;
    if (report.target_author) {
      try {
        if (typeof report.target_author === 'object') {
          targetAuthor = report.target_author;
        } else {
          targetAuthor = JSON.parse(report.target_author);
        }
      } catch (error) {
        console.error('Error parsing target_author:', error);
        targetAuthor = null;
      }
    }
    
    res.json({ 
      success: true,
      report: {
        id: report.id,
        targetType: report.target_type,
        targetId: report.target_id,
        targetName: report.target_name,
        targetContent: report.target_content,
        targetAuthor: targetAuthor,
        issueType: report.issue_type,
        description: report.description,
        status: report.status,
        adminNotes: report.admin_notes,
        reporterName: report.reporter_name,
        reporterEmail: report.reporter_email,
        reviewedBy: report.reviewed_by,
        createdAt: report.created_at,
        updatedAt: report.updated_at
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching report:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// ==================== ADMIN MANAGEMENT ENDPOINTS ====================

// Assign admin role
app.post('/api/admin/assign', authenticateUser, async (req, res) => {
  try {
    const { userId, role = 'moderator' } = req.body;
    
    // Check if current user is super admin
    const isSuperAdmin = await isUserSuperAdmin(req.userId);
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    
    // Validate role
    const validRoles = ['moderator', 'admin', 'super_admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    // Check if user exists
    const user = await dbService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('👑 Assigning admin role:', { userId, role, assignedBy: req.userId });
    
    // Create admin record
    const adminData = {
      userId,
      role,
      assignedBy: req.userId,
      permissions: {}
    };
    
    const admin = await dbService.createAdmin(adminData);
    
    console.log('✅ Admin assigned:', admin.id);
    res.json({ 
      success: true, 
      message: 'Admin role assigned successfully',
      admin: {
        id: admin.id,
        userId: admin.user_id,
        role: admin.role,
        permissions: admin.permissions,
        isActive: admin.is_active,
        assignedBy: admin.assigned_by,
        createdAt: admin.created_at
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
    
  } catch (error) {
    console.error('❌ Error assigning admin:', error);
    res.status(500).json({ error: 'Failed to assign admin role' });
  }
});

// Get admin users
app.get('/api/admin/users', authenticateUser, async (req, res) => {
  try {
    // Check if user is admin
    const isAdmin = await isUserAdmin(req.userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const admins = await dbService.getAdmins();
    
    res.json({ 
      success: true,
      admins: admins.map(admin => ({
        id: admin.id,
        userId: admin.user_id,
        role: admin.role,
        permissions: admin.permissions,
        isActive: admin.is_active,
        assignedBy: admin.assigned_by,
        name: admin.name,
        email: admin.email,
        userCreatedAt: admin.user_created_at,
        createdAt: admin.created_at,
        updatedAt: admin.updated_at
      }))
    });
    
  } catch (error) {
    console.error('❌ Error fetching admins:', error);
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
});

// Update admin role
app.put('/api/admin/users/:id', authenticateUser, async (req, res) => {
  try {
    const { id } = req.params;
    const { role, isActive } = req.body;
    
    // Check if current user is super admin
    const isSuperAdmin = await isUserSuperAdmin(req.userId);
    if (!isSuperAdmin) {
      return res.status(403).json({ error: 'Super admin access required' });
    }
    
    // Validate role if provided
    if (role) {
      const validRoles = ['moderator', 'admin', 'super_admin'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
    }
    
    console.log('👑 Updating admin:', { id, role, isActive });
    
    const updates = {};
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;
    
    const admin = await dbService.updateAdmin(id, updates);
    
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    
    console.log('✅ Admin updated:', admin.id);
    res.json({ 
      success: true, 
      message: 'Admin updated successfully',
      admin: {
        id: admin.id,
        userId: admin.user_id,
        role: admin.role,
        permissions: admin.permissions,
        isActive: admin.is_active,
        assignedBy: admin.assigned_by,
        createdAt: admin.created_at,
        updatedAt: admin.updated_at
      }
    });
    
  } catch (error) {
    console.error('❌ Error updating admin:', error);
    res.status(500).json({ error: 'Failed to update admin' });
  }
});

// ==================== PUSH NOTIFICATIONS ENDPOINTS ====================

// Register push token
app.post('/api/notifications/register-token', authenticateUser, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.userId;
    
    if (!token) {
      return res.status(400).json({ error: 'Push token is required' });
    }

    // Validate Expo push token
    if (!Expo.isExpoPushToken(token)) {
      return res.status(400).json({ error: 'Invalid Expo push token' });
    }
    
    // Store token in database
    await pool.query(
      'UPDATE users SET push_token = $1 WHERE id = $2',
      [token, userId]
    );
    
    console.log(`📱 Push token registered for user ${userId}`);
    res.json({ success: true, message: 'Push token registered successfully' });
  } catch (error) {
    console.error('❌ Error registering push token:', error);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

// Send notification to specific user
app.post('/api/notifications/send', authenticateUser, async (req, res) => {
  try {
    const { targetUserId, notification } = req.body;
    
    if (!targetUserId || !notification) {
      return res.status(400).json({ error: 'targetUserId and notification are required' });
    }

    if (!notification.title || !notification.body) {
      return res.status(400).json({ error: 'Notification title and body are required' });
    }
    
    // Get user's push token
    const result = await pool.query(
      'SELECT push_token, name FROM users WHERE id = $1',
      [targetUserId]
    );
    
    if (!result.rows[0]?.push_token) {
      return res.status(404).json({ error: 'User push token not found' });
    }
    
    // Create notification message
    const message = {
      to: result.rows[0].push_token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data || {},
      icon: 'https://res.cloudinary.com/djnd4utmi/image/upload/v1757524265/golden-dog_p6nsrz.png'
    };
    
    // Send notification
    const chunks = expo.chunkPushNotifications([message]);
    const tickets = [];
    
    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('❌ Error sending push notification:', error);
      }
    }
    
    console.log(`📤 Notification sent to user ${targetUserId} (${result.rows[0].name})`);
    res.json({ success: true, tickets, message: 'Notification sent successfully' });
  } catch (error) {
    console.error('❌ Error sending notification:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Send notification to multiple users
app.post('/api/notifications/send-multiple', authenticateUser, async (req, res) => {
  try {
    const { targetUserIds, notification } = req.body;
    
    if (!targetUserIds || !Array.isArray(targetUserIds) || targetUserIds.length === 0) {
      return res.status(400).json({ error: 'targetUserIds array is required' });
    }

    if (!notification || !notification.title || !notification.body) {
      return res.status(400).json({ error: 'Notification title and body are required' });
    }
    
    // Get users' push tokens
    const result = await pool.query(
      'SELECT id, push_token, name FROM users WHERE id = ANY($1) AND push_token IS NOT NULL',
      [targetUserIds]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No users with push tokens found' });
    }
    
    // Create notification messages
    const messages = result.rows.map(user => ({
      to: user.push_token,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: {
        ...notification.data,
        targetUserId: user.id
      }
    }));
    
    // Send notifications
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    
    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('❌ Error sending push notification chunk:', error);
      }
    }
    
    console.log(`📤 Notifications sent to ${result.rows.length} users`);
    res.json({ 
      success: true, 
      tickets, 
      sentTo: result.rows.length,
      message: `Notifications sent to ${result.rows.length} users successfully` 
    });
  } catch (error) {
    console.error('❌ Error sending multiple notifications:', error);
    res.status(500).json({ error: 'Failed to send notifications' });
  }
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('❌ Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
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
    
    // Log server status
    console.log('🚀 Backend server running on port', PORT);
    console.log('🌐 Network accessible at:', `http://${hostIp}:${PORT}`);
    console.log('📡 GitHub AI:', process.env.GITHUB_AI ? '✅' : '❌');
    console.log('🗺️ Google Maps:', process.env.GOOGLE_MAPS ? '✅' : '❌');
    console.log('🗄️ Database:', '✅ PostgreSQL (Production Ready)');
    console.log('📧 Email Service:', emailService.isReady() ? '✅ SendGrid Configured' : '⚠️ SendGrid Not Configured');
    console.log('🔗 CORS enabled for cross-origin requests');
    
    if (emailService.isReady()) {
      const emailStatus = emailService.getStatus();
      console.log('📧 Email Configuration:');
      console.log('   From Email:', emailStatus.fromEmail);
      console.log('   From Name:', emailStatus.fromName);
    } else {
      console.log('📧 Email Service: Development mode - emails will be logged only');
      console.log('💡 To enable real emails, set SENDGRID_API_KEY in environment variables');
    }
  });
} 

// Password reset endpoints
app.post('/api/auth/forgot-password', async (req, res) => {
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
      // Don't reveal if user exists or not for security
      return res.json({ message: 'If an account with that email exists, a password reset link has been sent' });
    }

    // Generate 6-digit reset code
    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token in database
    await dbService.createVerificationToken(email, resetToken, 'password_reset', expiresAt);

    // Send password reset email
    const emailResult = await emailService.sendPasswordResetEmail(email, resetToken, user.name);
    
    if (emailResult.success) {
      console.log(`📧 Password reset email sent to: ${email}`);
      res.json({ 
        message: 'If an account with that email exists, a password reset link has been sent',
        // In production, don't return the token
        ...(process.env.NODE_ENV === 'development' && { token: resetToken })
      });
    } else {
      console.error('❌ Failed to send password reset email:', emailResult.error);
      res.status(500).json({ error: 'Failed to send password reset email' });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;
    
    if (!email || !token || !newPassword) {
      return res.status(400).json({ error: 'Email, token, and new password are required' });
    }

    // Validate password strength
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if reset token exists and is valid
    const resetData = await dbService.getVerificationToken(email, token, 'password_reset');
    if (!resetData) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    // Find user
    const user = await dbService.getUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password in database
    await dbService.updateUser(email, { password: hashedPassword });
    
    // Mark reset token as used
    await dbService.markVerificationTokenAsUsed(resetData.id);

    console.log(`✅ Password reset successfully for user: ${email}`);

    res.json({ 
      message: 'Password reset successfully. You can now login with your new password.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// LLM Routes
app.use('/api/llm', require('./routes/llm'));

// Database migration endpoint - IMMEDIATE FIX
app.post('/api/admin/migrate-database', async (req, res) => {
  await migrateDatabaseEndpoint(req, res);
});

// GET endpoint for easy browser access
app.get('/api/admin/migrate-database', async (req, res) => {
  await migrateDatabaseEndpoint(req, res);
});

// Posts table migration endpoint
app.get('/api/admin/migrate-posts-table', async (req, res) => {
  try {
    console.log('🔄 Starting posts table migration...');
    
    // Check current posts table structure
    const tableInfo = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'posts' AND column_name = 'user_id'
    `);
    
    console.log('📊 Current posts user_id column info:', tableInfo.rows[0]);
    
    if (tableInfo.rows[0]?.data_type !== 'character varying') {
      console.log('🔧 Converting posts user_id column to VARCHAR...');
      
      // Drop foreign key constraint first
      await pool.query('ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_user_id_fkey');
      
      // Alter column type
      await pool.query('ALTER TABLE posts ALTER COLUMN user_id TYPE VARCHAR(255)');
      
      // Recreate foreign key constraint
      await pool.query('ALTER TABLE posts ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)');
      
      console.log('✅ Posts table user_id column migrated to VARCHAR');
      res.json({ 
        success: true, 
        message: 'Posts table user_id column migrated to VARCHAR successfully' 
      });
    } else {
      console.log('✅ Posts table user_id column is already VARCHAR');
      res.json({ 
        success: true, 
        message: 'Posts table user_id column is already VARCHAR' 
      });
    }
  } catch (error) {
    console.error('❌ Posts table migration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Posts table migration failed',
      details: error.message 
    });
  }
});

// POIs table migration endpoint
app.get('/api/admin/migrate-pois-table', async (req, res) => {
  try {
    console.log('🔄 Starting POIs table migration...');
    
    // Check current POIs table structure
    const tableInfo = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'pois' AND column_name = 'user_id'
    `);
    
    console.log('📊 Current POIs user_id column info:', tableInfo.rows[0]);
    
    if (tableInfo.rows[0]?.data_type !== 'character varying') {
      console.log('🔧 Converting POIs user_id column to VARCHAR...');
      
      // Drop foreign key constraint first
      await pool.query('ALTER TABLE pois DROP CONSTRAINT IF EXISTS pois_user_id_fkey');
      
      // Alter column type
      await pool.query('ALTER TABLE pois ALTER COLUMN user_id TYPE VARCHAR(255)');
      
      // Recreate foreign key constraint
      await pool.query('ALTER TABLE pois ADD CONSTRAINT pois_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)');
      
      console.log('✅ POIs table user_id column migrated to VARCHAR');
      res.json({ 
        success: true, 
        message: 'POIs table user_id column migrated to VARCHAR successfully' 
      });
    } else {
      console.log('✅ POIs table user_id column is already VARCHAR');
      res.json({ 
        success: true, 
        message: 'POIs table user_id column is already VARCHAR' 
      });
    }
  } catch (error) {
    console.error('❌ POIs table migration error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'POIs table migration failed',
      details: error.message 
    });
  }
});

// Shared migration logic
async function migrateDatabaseEndpoint(req, res) {
  try {
    console.log('🔄 Starting database migration...');
    
    // Check current table structure
    const tableInfo = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name = 'id'
    `);
    
    console.log('📊 Current ID column info:', tableInfo.rows[0]);
    
    if (tableInfo.rows[0]?.data_type === 'integer') {
      console.log('🔧 Converting ID column from INTEGER to VARCHAR...');
      
      // Drop any existing users_new table from failed migrations
      try {
        await pool.query('DROP TABLE IF EXISTS users_new CASCADE');
        console.log('🧹 Cleaned up any existing users_new table');
      } catch (cleanupError) {
        console.log('ℹ️ No existing users_new table to clean up');
      }
      
      // Create a temporary table with the new structure
      await pool.query(`
        CREATE TABLE users_new (
          id VARCHAR(255) PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          name VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          email_verified BOOLEAN DEFAULT FALSE,
          email_verified_at TIMESTAMP,
          preferences JSONB DEFAULT '{}',
          traveler_profile JSONB DEFAULT '{}',
          llm_config JSONB DEFAULT '{}',
          saved_agents JSONB DEFAULT '[]',
          friends JSONB DEFAULT '[]',
          likes INTEGER DEFAULT 0,
          posts JSONB DEFAULT '[]',
          communities JSONB DEFAULT '[]',
          trips JSONB DEFAULT '[]',
          last_known_location JSONB
        )
      `);
      
      // Copy data from old table to new table
      console.log('📋 Copying data from old table to new table...');
      await pool.query(`
        INSERT INTO users_new 
        SELECT 
          id::VARCHAR(255),
          email,
          password,
          name,
          created_at,
          last_login,
          email_verified,
          email_verified_at,
          preferences,
          traveler_profile,
          llm_config,
          saved_agents,
          friends,
          likes,
          posts,
          communities,
          trips,
          last_known_location
        FROM users
      `);
      
      console.log('🔄 Replacing old table with new structure...');
      
      // Drop foreign key constraints first
      console.log('🔗 Dropping foreign key constraints...');
      await pool.query('ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_user_id_fkey');
      await pool.query('ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_owner_id_fkey');
      await pool.query('ALTER TABLE pois DROP CONSTRAINT IF EXISTS pois_user_id_fkey');
      await pool.query('ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_user_id_fkey');
      await pool.query('ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_created_by_fkey');
      
      // Drop old table and rename new one
      await pool.query('DROP TABLE users');
      await pool.query('ALTER TABLE users_new RENAME TO users');
      
      // Recreate foreign key constraints with new ID type
      console.log('🔗 Recreating foreign key constraints...');
      await pool.query('ALTER TABLE trips ADD CONSTRAINT trips_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)');
      await pool.query('ALTER TABLE trips ADD CONSTRAINT trips_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id)');
      await pool.query('ALTER TABLE pois ADD CONSTRAINT pois_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)');
      await pool.query('ALTER TABLE posts ADD CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)');
      await pool.query('ALTER TABLE communities ADD CONSTRAINT communities_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id)');
      
      console.log('✅ ID column migration completed successfully!');
      res.json({ success: true, message: 'Database migration completed successfully!' });
    } else {
      console.log('ℹ️ ID column is already VARCHAR, no migration needed');
      res.json({ success: true, message: 'No migration needed - ID column is already VARCHAR' });
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    res.status(500).json({ error: 'Migration failed', details: error.message });
  }
}