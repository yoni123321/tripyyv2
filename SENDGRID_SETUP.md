# 📧 SendGrid Email Authentication Setup Guide

## 🚀 **Quick Start (5 minutes)**

### 1. **Create SendGrid Account**
- Go to [sendgrid.com](https://sendgrid.com)
- Sign up for a free account (100 emails/day)
- Verify your email address

### 2. **Get API Key**
- Navigate to **Settings → API Keys**
- Click **"Create API Key"**
- Choose **"Full Access"** or **"Restricted Access"** (recommended: Restricted Access with Mail Send permissions)
- Copy the generated API key

### 3. **Set Environment Variables**
Add these to your `.env` file or Railway environment variables:

```bash
# SendGrid Configuration
SENDGRID_API_KEY=your_api_key_here
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
SENDGRID_FROM_NAME=Your App Name

# Frontend URL (for email links)
FRONTEND_URL=https://yourapp.com
```

## 🔧 **Detailed Setup Steps**

### **Step 1: SendGrid Account Setup**

1. **Create Account**
   - Visit [sendgrid.com](https://sendgrid.com)
   - Click "Start for Free"
   - Fill in your details
   - Verify your email

2. **Choose Plan**
   - **Free**: 100 emails/day (perfect for testing)
   - **Essentials**: $15/month for 50k emails/month
   - **Pro**: $89/month for 100k emails/month

3. **Domain Authentication (Recommended)**
   - Go to **Settings → Sender Authentication**
   - Follow the domain authentication steps
   - This improves email deliverability

### **Step 2: API Key Creation**

1. **Navigate to API Keys**
   - Go to **Settings → API Keys**
   - Click **"Create API Key"**

2. **Choose Permissions**
   - **Full Access**: All permissions (not recommended for production)
   - **Restricted Access**: Choose only what you need
     - ✅ **Mail Send**: Required for sending emails
     - ✅ **Mail Settings**: For managing email settings
     - ❌ **Billing**: Not needed for basic email sending

3. **Generate and Copy**
   - Give your key a name (e.g., "Tripyy Email Service")
   - Click **"Create API Key"**
   - **IMPORTANT**: Copy the key immediately (you won't see it again)

### **Step 3: Environment Configuration**

#### **Local Development (.env file)**
```bash
# SendGrid
SENDGRID_API_KEY=SG.your_actual_api_key_here
SENDGRID_FROM_EMAIL=noreply@tripyy.com
SENDGRID_FROM_NAME=Tripyy Team

# Frontend
FRONTEND_URL=http://localhost:3000

# Other existing variables
DATABASE_URL=your_database_url
JWT_SECRET=your_jwt_secret
# ... other variables
```

#### **Railway Deployment**
1. Go to your Railway project
2. Navigate to **Variables** tab
3. Add these variables:
   ```
   SENDGRID_API_KEY=SG.your_actual_api_key_here
   SENDGRID_FROM_EMAIL=noreply@tripyy.com
   SENDGRID_FROM_NAME=Tripyy Team
   FRONTEND_URL=https://yourapp.com
   ```

### **Step 4: Test Your Setup**

1. **Local Testing**
   ```bash
   npm run test-email
   ```

2. **Check Server Status**
   ```bash
   curl http://localhost:3000/api/email/status
   ```

3. **Test Registration**
   - Register a new user
   - Check server logs for email sending
   - Verify email is received

## 📊 **Pricing Comparison**

| Plan | Price | Emails/Month | Best For |
|------|-------|--------------|----------|
| **Free** | $0 | 3,000 | Testing, MVP |
| **Essentials** | $15 | 50,000 | Small apps |
| **Pro** | $89 | 100,000 | Growing apps |
| **Premier** | Custom | Unlimited | Enterprise |

## 🔍 **Troubleshooting**

### **Common Issues**

1. **"SendGrid API key not found"**
   - Check environment variable name: `SENDGRID_API_KEY`
   - Restart your server after adding the variable

2. **"Emails not being sent"**
   - Verify API key is correct
   - Check SendGrid account status
   - Look for rate limiting (free tier: 100/day)

3. **"Emails going to spam"**
   - Authenticate your domain in SendGrid
   - Use a professional from email address
   - Avoid spam trigger words

4. **"API key permissions error"**
   - Ensure API key has "Mail Send" permission
   - Create a new API key if needed

### **Testing Commands**

```bash
# Test email service
npm run test-email

# Check server health
curl http://localhost:3000/api/health

# Check email service status
curl http://localhost:3000/api/email/status

# Test registration (will trigger verification email)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test User"}'
```

## 🎯 **Next Steps**

1. **Set up SendGrid account** and get API key
2. **Configure environment variables** in Railway
3. **Test email functionality** locally
4. **Deploy to Railway** and test in production
5. **Monitor email delivery** in SendGrid dashboard

## 📞 **Support**

- **SendGrid Support**: [support.sendgrid.com](https://support.sendgrid.com)
- **Documentation**: [docs.sendgrid.com](https://docs.sendgrid.com)
- **Community**: [community.sendgrid.com](https://community.sendgrid.com)

---

**🎉 You're all set!** Once you configure SendGrid, your Tripyy app will have professional email authentication with beautiful email templates.
