# Token Refresh System Implementation Guide

## Overview

This guide explains the token refresh system implemented for the Tripyy backend, which provides seamless user experience while maintaining security through token expiration.

## Backend Implementation

### New Endpoint: `POST /api/auth/refresh`

**Purpose**: Refreshes JWT tokens for active users while maintaining security through 7-day age validation.

**Request Headers**:
```
Authorization: Bearer <current_jwt_token>
Content-Type: application/json
```

**Response (Success - 200)**:
```json
{
  "message": "Token refreshed successfully",
  "token": "new_jwt_token_here",
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "User Name",
    "emailVerified": true,
    "lastLogin": "2024-01-15T10:30:00.000Z"
  }
}
```

**Response (Error - 401)**:
```json
{
  "error": "Token expired. Please login again.",
  "code": "TOKEN_EXPIRED"
}
```

### Security Features

1. **7-Day Age Validation**: Tokens older than 7 days are rejected
2. **Token Verification**: Only valid JWT tokens can be refreshed
3. **User Validation**: User must exist in database
4. **Last Login Update**: User's last login timestamp is updated on successful refresh

## Frontend Integration (React Native)

### 1. Token Storage Utilities

```javascript
// utils/tokenStorage.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';

export const tokenStorage = {
  async setAuthData(token, user) {
    await AsyncStorage.multiSet([
      [TOKEN_KEY, token],
      [USER_KEY, JSON.stringify(user)]
    ]);
  },

  async getToken() {
    return await AsyncStorage.getItem(TOKEN_KEY);
  },

  async getUser() {
    const userData = await AsyncStorage.getItem(USER_KEY);
    return userData ? JSON.parse(userData) : null;
  },

  async clearAuthData() {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  },

  async isAuthenticated() {
    const token = await this.getToken();
    const user = await this.getUser();
    return !!(token && user);
  }
};
```

### 2. Authentication Service

```javascript
// services/authService.js
import axios from 'axios';
import { tokenStorage } from '../utils/tokenStorage';

const API_BASE_URL = 'YOUR_API_BASE_URL';

class AuthService {
  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
    });

    // Add request interceptor to include token
    this.api.interceptors.request.use(async (config) => {
      const token = await tokenStorage.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Add response interceptor to handle token refresh
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const refreshed = await this.refreshToken();
            if (refreshed) {
              // Retry the original request with new token
              const token = await tokenStorage.getToken();
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return this.api(originalRequest);
            }
          } catch (refreshError) {
            // Refresh failed, redirect to login
            await this.logout();
            throw refreshError;
          }
        }

        return Promise.reject(error);
      }
    );
  }

  async refreshToken() {
    try {
      const token = await tokenStorage.getToken();
      if (!token) return false;

      const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {}, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.status === 200) {
        const { token: newToken, user } = response.data;
        await tokenStorage.setAuthData(newToken, user);
        console.log('✅ Token refreshed successfully');
        return true;
      }

      return false;
    } catch (error) {
      console.error('❌ Token refresh failed:', error.response?.data || error.message);
      return false;
    }
  }

  async login(email, password) {
    try {
      const response = await this.api.post('/api/auth/login', { email, password });
      const { token, user } = response.data;
      
      await tokenStorage.setAuthData(token, user);
      return { success: true, user };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.error || 'Login failed' 
      };
    }
  }

  async logout() {
    await tokenStorage.clearAuthData();
  }

  async isAuthenticated() {
    return await tokenStorage.isAuthenticated();
  }
}

export default new AuthService();
```

### 3. App Startup Token Refresh

```javascript
// App.js or your main component
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import AuthService from './services/authService';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Check if user is authenticated
      const authenticated = await AuthService.isAuthenticated();
      
      if (authenticated) {
        // Try to refresh token on app startup
        const refreshed = await AuthService.refreshToken();
        setIsAuthenticated(refreshed);
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error('App initialization error:', error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {isAuthenticated ? (
        <YourMainApp />
      ) : (
        <YourLoginScreen />
      )}
    </View>
  );
}
```

### 4. Authentication Context (Optional)

```javascript
// contexts/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import AuthService from '../services/authService';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      const authenticated = await AuthService.isAuthenticated();
      if (authenticated) {
        const refreshed = await AuthService.refreshToken();
        if (refreshed) {
          const userData = await AuthService.getUser();
          setUser(userData);
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    const result = await AuthService.login(email, password);
    if (result.success) {
      setUser(result.user);
    }
    return result;
  };

  const logout = async () => {
    await AuthService.logout();
    setUser(null);
  };

  const value = {
    user,
    isLoading,
    login,
    logout,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
```

## Testing

### Backend Testing

Run the test script to verify the refresh endpoint:

```bash
node test-refresh-endpoint.js
```

Make sure to:
1. Update `TEST_EMAIL` and `TEST_PASSWORD` in the test file
2. Ensure your server is running
3. Have a test user in your database

### Frontend Testing

1. **Login Flow**: Test normal login and token storage
2. **App Startup**: Test token refresh when app starts
3. **Token Expiry**: Test behavior when token is older than 7 days
4. **Network Errors**: Test handling of network failures during refresh

## Security Considerations

1. **Token Age**: Tokens are automatically rejected after 7 days
2. **Secure Storage**: Use AsyncStorage for token storage (consider encryption for production)
3. **Network Security**: Always use HTTPS in production
4. **Error Handling**: Properly handle refresh failures and redirect to login
5. **Logout**: Clear all stored data on logout

## User Experience

- **Active Users**: Never need to login again (if they use app within 7 days)
- **Inactive Users**: Must login again after 7 days of inactivity
- **Seamless**: Automatic token renewal happens in background
- **Secure**: Automatic logout after extended inactivity

## Error Codes

- `TOKEN_EXPIRED`: Token is older than 7 days
- `INVALID_TOKEN`: Token is malformed or invalid
- `USER_NOT_FOUND`: User no longer exists in database

This implementation provides a secure, user-friendly authentication system that balances security with user experience.
