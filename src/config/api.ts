// Local development API configuration
export const API_CONFIG = {
  // IMPORTANT: Set your API keys in environment variables
  GITHUB_TOKEN: process.env.EXPO_PUBLIC_GITHUB_TOKEN || process.env.GROK_API_KEY || '',
  GOOGLE_API_KEY: process.env.EXPO_PUBLIC_GOOGLE_API_KEY || '',
  ENDPOINT: 'https://models.github.ai/inference/chat/completions',
  MODEL: 'xai/grok-3',
  MAX_TOKENS: 1000,
  TEMPERATURE: 0.7,
  TOP_P: 0.9,
  TIMEOUT: 60000, // Increased to 60 seconds for complex requests like detailed itineraries
  DEBUG: process.env.NODE_ENV === 'development', // Only enable debug in development
};

// API Base URL configuration
export const getApiBaseUrl = () => {
  // For local development, use the computer's IP address for network access
  if (__DEV__) {
    return process.env.EXPO_PUBLIC_API_URL || 'http://10.0.0.9:3000';
  }
  
  // For production, use environment variable
  return process.env.EXPO_PUBLIC_API_URL || 'http://10.0.0.9:3000';
};

// Security validation
export const validateApiKeys = () => {
  const missingKeys: string[] = [];
  
  if (!API_CONFIG.GITHUB_TOKEN || API_CONFIG.GITHUB_TOKEN === '') {
    missingKeys.push('GitHub AI API Key');
  }
  
  if (!API_CONFIG.GOOGLE_API_KEY || API_CONFIG.GOOGLE_API_KEY === '') {
    missingKeys.push('Google API Key');
  }
  
  if (missingKeys.length > 0) {
    console.warn('⚠️ Missing API Keys:', missingKeys.join(', '));
    console.warn('Please set the following environment variables:');
    missingKeys.forEach(key => {
      if (key.includes('GitHub')) {
        console.warn('  EXPO_PUBLIC_GITHUB_TOKEN=your_github_token_here');
      }
      if (key.includes('Google')) {
        console.warn('  EXPO_PUBLIC_GOOGLE_API_KEY=your_google_api_key_here');
      }
    });
  }
  
  return missingKeys.length === 0;
}; 