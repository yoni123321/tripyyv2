# Railway Environment Variables Setup

## Required Environment Variables for AI Agent

Add these environment variables to your Railway project dashboard:

### AI Agent API Keys

```bash
# Anthropic API Key (for Claude AI)
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# GitHub/Grok API Key (for Grok AI) 
GROK_API_KEY=your_grok_api_key_here

# Google API Key (for Google services)
EXPO_PUBLIC_GOOGLE_API_KEY=your_google_api_key_here

# Optional: GitHub token (alternative to Grok)
EXPO_PUBLIC_GITHUB_TOKEN=your_github_token_here
```

### Other Required Variables (if not already set)

```bash
# Security
JWT_SECRET=your_jwt_secret_here

# Database
DATABASE_URL=your_database_url_here

# Cloudinary (for image uploads)
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Email Service
SENDGRID_API_KEY=your_sendgrid_api_key_here

# Payment Services (if using)
PAYPAL_MODE=live
PAYPAL_CLIENT_ID=your_paypal_client_id
PAYPAL_CLIENT_SECRET=your_paypal_client_secret
CHECKOUT_SECRET_KEY=your_checkout_secret_key
CHECKOUT_PUBLIC_KEY=your_checkout_public_key

# CORS
ALLOWED_ORIGINS=https://your-frontend-domain.com,https://your-app-domain.com
```

## How to Add Variables in Railway

### Option 1: Railway Dashboard
1. Go to [railway.app](https://railway.app)
2. Select your Tripyy backend project
3. Click on your service
4. Go to "Variables" tab
5. Add each variable with its value
6. Click "Deploy" to apply changes

### Option 2: Railway CLI
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Set variables one by one
railway variables set ANTHROPIC_API_KEY=your_actual_key_here
railway variables set GROK_API_KEY=your_actual_key_here
railway variables set EXPO_PUBLIC_GOOGLE_API_KEY=your_actual_key_here

# Or set multiple at once
railway variables set ANTHROPIC_API_KEY=key1 GROK_API_KEY=key2 EXPO_PUBLIC_GOOGLE_API_KEY=key3
```

## Getting API Keys

### Anthropic API Key
1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up/Login
3. Navigate to API Keys
4. Create new API key
5. Copy the key (starts with `sk-ant-`)

### Grok API Key
1. Go to [x.ai](https://x.ai/)
2. Sign up for Grok API access
3. Get your API key from the dashboard

### Google API Key
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable the APIs you need
4. Create credentials (API Key)
5. Copy the key (starts with `AIza`)

## Verification

After setting the variables, your AI agent endpoints should work:
- `POST /api/llm/chat` - Claude AI chat
- `GET /api/llm/usage` - Usage tracking
- `GET /api/llm/health` - Health check

The system will automatically use the appropriate API key based on the service configuration.
