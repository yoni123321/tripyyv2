const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3000'; // Adjust if your server runs on different port
const TEST_EMAIL = 'test@example.com'; // Replace with a test user email
const TEST_PASSWORD = 'testpassword'; // Replace with test user password

async function testRefreshEndpoint() {
  try {
    console.log('🧪 Testing Token Refresh Endpoint\n');

    // Step 1: Login to get a token
    console.log('1️⃣ Logging in to get initial token...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });

    if (loginResponse.status !== 200) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const { token, user } = loginResponse.data;
    console.log(`✅ Login successful for user: ${user.email}`);
    console.log(`🔑 Token received: ${token.substring(0, 20)}...`);

    // Step 2: Test token refresh
    console.log('\n2️⃣ Testing token refresh...');
    const refreshResponse = await axios.post(`${BASE_URL}/api/auth/refresh`, {}, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (refreshResponse.status !== 200) {
      throw new Error(`Refresh failed: ${refreshResponse.status}`);
    }

    const { token: newToken, user: refreshedUser } = refreshResponse.data;
    console.log(`✅ Token refresh successful`);
    console.log(`🔑 New token: ${newToken.substring(0, 20)}...`);
    console.log(`👤 User data:`, {
      id: refreshedUser.id,
      email: refreshedUser.email,
      name: refreshedUser.name,
      lastLogin: refreshedUser.lastLogin
    });

    // Step 3: Verify the new token works
    console.log('\n3️⃣ Verifying new token works...');
    const profileResponse = await axios.get(`${BASE_URL}/api/user/traveler-profile`, {
      headers: {
        'Authorization': `Bearer ${newToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (profileResponse.status !== 200) {
      throw new Error(`Profile request failed: ${profileResponse.status}`);
    }

    console.log(`✅ New token works! Profile data received`);

    // Step 4: Test with old token (should still work)
    console.log('\n4️⃣ Testing old token still works...');
    const oldTokenProfileResponse = await axios.get(`${BASE_URL}/api/user/traveler-profile`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (oldTokenProfileResponse.status !== 200) {
      console.log(`⚠️ Old token no longer works (this is expected if you implement token invalidation)`);
    } else {
      console.log(`✅ Old token still works`);
    }

    console.log('\n🎉 All tests passed! Token refresh system is working correctly.');

  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n💡 This might be because:');
      console.log('   - The test user doesn\'t exist');
      console.log('   - The password is incorrect');
      console.log('   - The server is not running');
      console.log('   - The token is older than 7 days');
    }
  }
}

// Run the test
testRefreshEndpoint();
