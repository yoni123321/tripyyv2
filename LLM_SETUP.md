# LLM Service Setup Guide

## 🚀 **Overview**
This guide explains how to set up the LLM (Large Language Model) service for Tripyy using Anthropic Claude 3 Haiku as the default AI provider.

## 🔑 **Required Environment Variables**

### **1. Anthropic API Key**
```bash
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

**How to get it:**
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Sign up/Login to your account
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key and add it to your `.env` file

### **2. Database URL (Already configured)**
```bash
DATABASE_URL=your_postgresql_connection_string
```

## 📊 **Rate Limits by Account Type**

| Account Type | Requests/Month | Description |
|--------------|----------------|-------------|
| **traveler** | 50 | Basic users (default) |
| **pro** | 200 | Premium users |
| **creator** | 500 | Content creators |

## 🌐 **API Endpoints**

### **1. Chat Endpoint**
```http
POST /api/llm/chat
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "message": "Help me plan a trip to Japan",
  "context": {
    "destination": "Japan",
    "dates": {
      "startDate": "2024-04-01",
      "endDate": "2024-04-15"
    },
    "budget": "$3000",
    "interests": ["culture", "food", "nature"],
    "numberOfTravelers": 2
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "content": "AI response text here",
    "model": "claude-3-haiku-20240307",
    "usage": {
      "input_tokens": 150,
      "output_tokens": 300
    }
  },
  "message": "Chat response generated successfully"
}
```

### **2. Usage Tracking**
```http
GET /api/llm/usage
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "currentMonth": "2024-01",
    "accountType": "traveler",
    "limit": 50,
    "used": 15,
    "remaining": 35,
    "resetDate": "2024-02"
  }
}
```

### **3. Health Check**
```http
GET /api/llm/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "database": "connected",
    "anthropic": "configured",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

## 🔒 **Security Features**

- **No API Key Validation**: User API keys are validated on the device, not in the backend
- **Rate Limiting**: Prevents abuse and manages costs
- **Usage Tracking**: Monitors API usage per user
- **Authentication Required**: All endpoints require valid JWT tokens

## 💰 **Cost Optimization**

- **Claude 3 Haiku**: $0.25/$1.25 per 1M tokens (input/output)
- **Smart Fallback**: Users with their own keys use those; others use your backend service
- **Usage Monitoring**: Track costs and prevent abuse

## 🚨 **Error Handling**

### **Rate Limit Exceeded (429)**
```json
{
  "success": false,
  "error": "Rate limit exceeded",
  "rateLimit": {
    "limit": 50,
    "used": 50,
    "resetDate": "2024-02"
  },
  "message": "Rate limit exceeded. You've used 50/50 requests this month. Reset on 2024-02."
}
```

### **Service Unavailable (503)**
```json
{
  "success": false,
  "error": "Service unavailable",
  "message": "LLM service health check failed"
}
```

## 🧪 **Testing**

### **1. Test Health Check**
```bash
curl https://your-railway-url.railway.app/api/llm/health
```

### **2. Test Chat (with auth)**
```bash
curl -X POST https://your-railway-url.railway.app/api/llm/chat \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, can you help me plan a trip?"}'
```

### **3. Test Usage (with auth)**
```bash
curl https://your-railway-url.railway.app/api/llm/usage \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🔧 **Troubleshooting**

### **Common Issues:**

1. **"Anthropic API key not configured"**
   - Check `ANTHROPIC_API_KEY` environment variable
   - Ensure the key is valid and has sufficient credits

2. **"Rate limit exceeded"**
   - User has reached their monthly limit
   - Wait until next month or upgrade account type

3. **"Service unavailable"**
   - Check database connection
   - Verify Anthropic API key is working

## 📱 **Frontend Integration**

The frontend should:
1. **Handle API key validation** locally
2. **Use backend LLM service** when user has no API key
3. **Display usage information** to users
4. **Handle rate limit errors** gracefully

## 🚀 **Next Steps**

1. **Set up environment variables** in Railway
2. **Test the endpoints** using the examples above
3. **Integrate with frontend** for seamless user experience
4. **Monitor usage and costs** to optimize performance
