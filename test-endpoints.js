const axios = require('axios');

const BASE_URL = 'https://tripyyv2-production.up.railway.app';

// Test data
const testUser = {
  email: 'dev@tripyy.com',
  password: 'test123' // This might need to be updated with actual password
};

let authToken = null;

async function testEndpoints() {
  console.log('🧪 Testing Tripyy Backend Endpoints...\n');
  
  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing Health Check...');
    const healthResponse = await axios.get(`${BASE_URL}/api/health`);
    console.log('✅ Health Check:', healthResponse.data);
    
    // Test 2: Login to get token
    console.log('\n2️⃣ Testing Authentication...');
    try {
      const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, testUser);
      authToken = loginResponse.data.token;
      console.log('✅ Login successful, token received');
    } catch (error) {
      console.log('❌ Login failed:', error.response?.data || error.message);
      console.log('⚠️ Continuing with public endpoints only...');
    }
    
    // Test 3: Public POIs endpoint
    console.log('\n3️⃣ Testing Public POIs...');
    const poisResponse = await axios.get(`${BASE_URL}/api/pois`);
    console.log('✅ POIs endpoint:', {
      count: poisResponse.data.pois?.length || 0,
      sample: poisResponse.data.pois?.[0]?.name || 'None'
    });
    
    // Test 4: Public Communities endpoint
    console.log('\n4️⃣ Testing Public Communities...');
    const communitiesResponse = await axios.get(`${BASE_URL}/api/communities`);
    console.log('✅ Communities endpoint:', {
      count: communitiesResponse.data.communities?.length || 0,
      sample: communitiesResponse.data.communities?.[0]?.name || 'None'
    });
    
    // Test 5: Public Posts endpoint
    console.log('\n5️⃣ Testing Public Posts...');
    const postsResponse = await axios.get(`${BASE_URL}/api/posts`);
    console.log('✅ Posts endpoint:', {
      count: postsResponse.data.data?.posts?.length || 0,
      sample: postsResponse.data.data?.posts?.[0]?.content?.substring(0, 50) || 'None'
    });
    
    // Test 6: Protected endpoints (if we have a token)
    if (authToken) {
      console.log('\n6️⃣ Testing Protected Endpoints...');
      
      const headers = { Authorization: `Bearer ${authToken}` };
      
      // Test User Profile
      try {
        const profileResponse = await axios.get(`${BASE_URL}/api/user/traveler-profile`, { headers });
        console.log('✅ User Profile:', {
          name: profileResponse.data.name,
          nickname: profileResponse.data.nickname
        });
      } catch (error) {
        console.log('❌ User Profile failed:', error.response?.data?.error || error.message);
      }
      
      // Test User Stats
      try {
        const statsResponse = await axios.get(`${BASE_URL}/api/user/stats`, { headers });
        console.log('✅ User Stats:', statsResponse.data);
      } catch (error) {
        console.log('❌ User Stats failed:', error.response?.data?.error || error.message);
      }
      
      // Test User Friends
      try {
        const friendsResponse = await axios.get(`${BASE_URL}/api/user/friends`, { headers });
        console.log('✅ User Friends:', {
          count: friendsResponse.data.data?.friends?.length || 0,
          sample: friendsResponse.data.data?.friends?.[0]?.name || 'None'
        });
      } catch (error) {
        console.log('❌ User Friends failed:', error.response?.data?.error || error.message);
      }
      
      // Test User LLM Config
      try {
        const llmResponse = await axios.get(`${BASE_URL}/api/user/llm-config`, { headers });
        console.log('✅ User LLM Config:', {
          agent: llmResponse.data.llmConfig?.agent,
          model: llmResponse.data.llmConfig?.model
        });
      } catch (error) {
        console.log('❌ User LLM Config failed:', error.response?.data?.error || error.message);
      }
      
      // Test Trips
      try {
        const tripsResponse = await axios.get(`${BASE_URL}/api/trips`, { headers });
        console.log('✅ User Trips:', {
          count: tripsResponse.data.trips?.length || 0,
          sample: tripsResponse.data.trips?.[0]?.name || 'None'
        });
      } catch (error) {
        console.log('❌ User Trips failed:', error.response?.data?.error || error.message);
      }
      
    } else {
      console.log('\n6️⃣ Skipping Protected Endpoints (no auth token)');
    }
    
    // Test 7: Search endpoints
    console.log('\n7️⃣ Testing Search Endpoints...');
    try {
      const searchResponse = await axios.get(`${BASE_URL}/api/search?q=test`);
      console.log('✅ Search endpoint:', {
        users: searchResponse.data.users?.length || 0,
        communities: searchResponse.data.communities?.length || 0
      });
    } catch (error) {
      console.log('❌ Search failed:', error.response?.data?.error || error.message);
    }
    
    console.log('\n🎉 Endpoint testing completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the tests
testEndpoints();
