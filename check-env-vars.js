#!/usr/bin/env node

/**
 * Environment Variables Checker
 * Verifies that all required environment variables are set
 */

require('dotenv').config();

const requiredVars = {
  // Core server variables
  'JWT_SECRET': 'JWT secret for token signing',
  'DATABASE_URL': 'PostgreSQL database connection string',
  
  // AI Agent variables
  'ANTHROPIC_API_KEY': 'Anthropic API key for Claude AI',
  'GROK_API_KEY': 'Grok API key for Grok AI (alternative to GitHub token)',
  'EXPO_PUBLIC_GOOGLE_API_KEY': 'Google API key for Google services',
  
  // Optional AI variables
  'EXPO_PUBLIC_GITHUB_TOKEN': 'GitHub token (alternative to Grok)',
  
  // Cloudinary (for image uploads)
  'CLOUDINARY_CLOUD_NAME': 'Cloudinary cloud name',
  'CLOUDINARY_API_KEY': 'Cloudinary API key',
  'CLOUDINARY_API_SECRET': 'Cloudinary API secret',
  
  // Email service
  'SENDGRID_API_KEY': 'SendGrid API key for emails',
  
  // Payment services (optional)
  'PAYPAL_CLIENT_ID': 'PayPal client ID',
  'PAYPAL_CLIENT_SECRET': 'PayPal client secret',
  'CHECKOUT_SECRET_KEY': 'Checkout.com secret key',
  'CHECKOUT_PUBLIC_KEY': 'Checkout.com public key',
};

const optionalVars = {
  'NODE_ENV': 'Node environment (defaults to development)',
  'PORT': 'Server port (defaults to 3000)',
  'ALLOWED_ORIGINS': 'CORS allowed origins',
  'PAYPAL_MODE': 'PayPal mode (sandbox/live)',
};

console.log('🔍 Checking Environment Variables\n');

let missingRequired = [];
let missingOptional = [];
let presentVars = [];

// Check required variables
Object.entries(requiredVars).forEach(([key, description]) => {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    missingRequired.push({ key, description });
  } else {
    presentVars.push({ key, description, value: value.substring(0, 10) + '...' });
  }
});

// Check optional variables
Object.entries(optionalVars).forEach(([key, description]) => {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    missingOptional.push({ key, description });
  } else {
    presentVars.push({ key, description, value: value.substring(0, 10) + '...' });
  }
});

// Display results
console.log('✅ Present Variables:');
presentVars.forEach(({ key, description, value }) => {
  console.log(`   ${key}: ${value} (${description})`);
});

if (missingRequired.length > 0) {
  console.log('\n❌ Missing Required Variables:');
  missingRequired.forEach(({ key, description }) => {
    console.log(`   ${key}: ${description}`);
  });
}

if (missingOptional.length > 0) {
  console.log('\n⚠️  Missing Optional Variables:');
  missingOptional.forEach(({ key, description }) => {
    console.log(`   ${key}: ${description}`);
  });
}

// AI Agent specific checks
console.log('\n🤖 AI Agent Configuration:');
const aiServices = {
  'Anthropic (Claude)': !!process.env.ANTHROPIC_API_KEY,
  'Grok AI': !!process.env.GROK_API_KEY,
  'GitHub AI': !!process.env.EXPO_PUBLIC_GITHUB_TOKEN,
  'Google AI': !!process.env.EXPO_PUBLIC_GOOGLE_API_KEY,
};

Object.entries(aiServices).forEach(([service, available]) => {
  console.log(`   ${service}: ${available ? '✅ Available' : '❌ Not configured'}`);
});

// Summary
console.log('\n📊 Summary:');
console.log(`   Total variables checked: ${Object.keys(requiredVars).length + Object.keys(optionalVars).length}`);
console.log(`   Present: ${presentVars.length}`);
console.log(`   Missing required: ${missingRequired.length}`);
console.log(`   Missing optional: ${missingOptional.length}`);

if (missingRequired.length === 0) {
  console.log('\n🎉 All required environment variables are set!');
  console.log('   Your backend should work properly.');
} else {
  console.log('\n⚠️  Some required variables are missing.');
  console.log('   Please set the missing variables before running the server.');
  process.exit(1);
}

// Railway specific check
if (process.env.RAILWAY_ENVIRONMENT) {
  console.log('\n🚄 Railway Environment Detected');
  console.log('   Make sure all variables are set in Railway dashboard');
} else {
  console.log('\n💡 For Railway deployment:');
  console.log('   1. Go to Railway dashboard');
  console.log('   2. Select your project');
  console.log('   3. Go to Variables tab');
  console.log('   4. Add all missing variables');
  console.log('   5. Redeploy your service');
}
