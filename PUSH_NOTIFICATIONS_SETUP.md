# Push Notifications Setup

## Environment Variables

Add the following to your `.env` file:

```env
# Expo Push Notifications
EXPO_ACCESS_TOKEN=your_expo_access_token_here
```

## Getting Your Expo Access Token

1. Go to [Expo Dashboard](https://expo.dev/)
2. Sign in to your account
3. Go to Account Settings
4. Navigate to Access Tokens
5. Create a new access token
6. Copy the token and add it to your `.env` file

## API Endpoints

### 1. Register Push Token
**POST** `/api/notifications/register-token`

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Body:**
```json
{
  "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Push token registered successfully"
}
```

### 2. Send Notification to Single User
**POST** `/api/notifications/send`

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Body:**
```json
{
  "targetUserId": "user_id_here",
  "notification": {
    "type": "like",
    "title": "Someone liked your post!",
    "body": "John Doe liked your post about Paris",
    "data": {
      "postId": "123",
      "userId": "456"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "tickets": [...],
  "message": "Notification sent successfully"
}
```

### 3. Send Notification to Multiple Users
**POST** `/api/notifications/send-multiple`

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Body:**
```json
{
  "targetUserIds": ["user1", "user2", "user3"],
  "notification": {
    "type": "announcement",
    "title": "New Feature Available!",
    "body": "Check out our new trip planning features",
    "data": {
      "feature": "trip_planner"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "tickets": [...],
  "sentTo": 3,
  "message": "Notifications sent to 3 users successfully"
}
```

## Features

- ✅ Token registration and validation
- ✅ Send to single user
- ✅ Send to multiple users
- ✅ Error handling for invalid tokens
- ✅ Integration with existing user authentication
- ✅ Proper Expo push token validation
- ✅ Chunked sending for large batches
- ✅ Comprehensive error handling

## Testing

You can test the endpoints using tools like Postman or curl:

```bash
# Register token
curl -X POST http://localhost:3000/api/notifications/register-token \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"}'

# Send notification
curl -X POST http://localhost:3000/api/notifications/send \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetUserId": "user_id",
    "notification": {
      "title": "Test Notification",
      "body": "This is a test notification",
      "data": {"test": true}
    }
  }'
```
