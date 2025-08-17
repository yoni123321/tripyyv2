# Tripyy Backend API

A comprehensive backend API server for the Tripyy travel application, built with Node.js, Express, and PostgreSQL.

## 🚀 Features

- **User Authentication**: JWT-based authentication with email verification
- **Travel Management**: Create, update, and manage travel itineraries
- **POI System**: Points of Interest with reviews and ratings
- **Social Features**: Posts, comments, likes, and communities
- **Image Upload**: Cloudinary integration for photo management
- **Payment Integration**: PayPal and Checkout.com support
- **Database**: PostgreSQL with automatic table initialization

## 🏗️ Architecture

```
tripyy-backend/
├── server-simple.js          # Main server file
├── migrate-data.js           # Data migration script
├── package.json              # Dependencies and scripts
├── railway.json              # Railway deployment config
├── .env                      # Environment variables (create this)
├── .gitignore               # Git ignore rules
├── src/
│   ├── config/              # Configuration files
│   │   ├── database.js      # Database connection & schema
│   │   ├── swagger.js       # API documentation
│   │   └── sentry.js        # Error tracking
│   ├── services/            # Business logic services
│   │   ├── database-service.js  # Database operations
│   │   ├── cloudinary.js    # Image upload service
│   │   ├── checkout.js      # Payment processing
│   │   └── paypal-payments.js # PayPal integration
│   ├── middleware/          # Express middleware
│   │   └── validation.js    # Request validation
│   ├── utils/               # Utility functions
│   │   └── logger.js        # Logging service
│   └── routes/              # API route definitions
├── data/                    # Local data storage (for migration)
└── uploads/                 # File uploads directory
```

## 🛠️ Setup

### Prerequisites

- Node.js (v16 or higher)
- PostgreSQL database
- Cloudinary account (for image uploads)
- PayPal/Checkout.com accounts (for payments)

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd tripyy-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create environment file**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up environment variables**
   ```env
   # Server Configuration
   NODE_ENV=development
   PORT=3000
   
   # Security
   JWT_SECRET=your-super-secret-jwt-key-here
   
   # Cloudinary
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret
   
   # Database
   DATABASE_URL=postgresql://username:password@host:port/database
   
   # Payment Services
   PAYPAL_MODE=sandbox
   PAYPAL_CLIENT_ID=your-paypal-client-id
   PAYPAL_CLIENT_SECRET=your-paypal-client-secret
   CHECKOUT_SECRET_KEY=your-checkout-secret-key
   CHECKOUT_PUBLIC_KEY=your-checkout-public-key
   
   # CORS
   ALLOWED_ORIGINS=https://your-frontend-domain.com,http://localhost:3000
   ```

5. **Initialize database**
   ```bash
   npm run migrate
   ```

6. **Start the server**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm start
   ```

## 🗄️ Database Migration

The `migrate-data.js` script will:

1. Connect to your PostgreSQL database
2. Create all necessary tables
3. Migrate existing data from `data/data.json`
4. Handle conflicts and data validation

Run migration:
```bash
npm run migrate
```

## 🚀 Railway Deployment

1. **Connect to Railway**
   - Push your code to GitHub
   - Connect Railway to your GitHub repository
   - Railway will automatically detect the Node.js project

2. **Set environment variables**
   - Add all required environment variables in Railway dashboard
   - Railway will provide `DATABASE_URL` automatically

3. **Deploy**
   - Railway will build and deploy automatically
   - Monitor logs for any startup issues

## 📚 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/send-verification` - Send email verification
- `POST /api/auth/verify-email` - Verify email address

### Users
- `GET /api/user/traveler-profile` - Get user profile
- `PUT /api/user/traveler-profile` - Update user profile
- `GET /api/user/stats` - Get user statistics
- `GET /api/user/friends` - Get user friends

### Trips
- `POST /api/trips` - Create new trip
- `GET /api/trips` - Get user trips
- `PUT /api/trips/:id` - Update trip
- `DELETE /api/trips/:id` - Delete trip

### POIs (Points of Interest)
- `GET /api/pois` - Get all POIs
- `POST /api/pois` - Create new POI
- `PUT /api/pois` - Update POI
- `DELETE /api/pois` - Delete POI
- `POST /api/pois/review` - Add POI review

### Social Features
- `GET /api/posts` - Get all posts
- `POST /api/posts` - Create new post
- `POST /api/posts/:id/like` - Like/unlike post
- `POST /api/posts/:id/comments` - Add comment

### Communities
- `GET /api/communities` - Get all communities
- `POST /api/communities` - Create community
- `POST /api/communities/:id/join` - Join community
- `POST /api/communities/:id/leave` - Leave community

### Utilities
- `GET /api/health` - Health check endpoint
- `POST /api/upload` - Image upload to Cloudinary
- `GET /api/search` - Search users and communities

## 🔧 Development

### Scripts
- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm run migrate` - Run database migration
- `npm test` - Run tests (not implemented yet)

### Code Structure
- **Services**: Business logic and external API integrations
- **Middleware**: Request processing and validation
- **Config**: Database and service configurations
- **Utils**: Helper functions and logging

## 🚨 Important Notes

1. **Environment Variables**: Never commit `.env` file to version control
2. **Database**: Always backup data before running migration
3. **JWT Secret**: Use a strong, random secret in production
4. **CORS**: Configure allowed origins for production deployment
5. **File Uploads**: Cloudinary is required for image functionality

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the API documentation at `/api/docs` (when implemented)
- Review the logs for error details

## 🔄 Migration from File Storage

This server has been migrated from local file storage to PostgreSQL database. The migration script will automatically transfer all existing data while maintaining data integrity and relationships.
