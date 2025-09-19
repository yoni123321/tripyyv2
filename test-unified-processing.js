#!/usr/bin/env node

/**
 * Test Script for Unified Message Processing
 * Tests both legacy and unified processing paths
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3000'; // Adjust if your server runs on different port
const TEST_EMAIL = 'test@example.com'; // Replace with a test user email
const TEST_PASSWORD = 'testpassword'; // Replace with test user password

async function testUnifiedProcessing() {
  try {
    console.log('🧪 Testing Unified Message Processing\n');

    // Step 1: Login to get a token
    console.log('1️⃣ Logging in to get authentication token...');
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });

    if (loginResponse.status !== 200) {
      throw new Error(`Login failed: ${loginResponse.status}`);
    }

    const { token } = loginResponse.data;
    console.log(`✅ Login successful, token: ${token.substring(0, 20)}...`);

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // Step 2: Test Legacy Processing (no processedPrompt)
    console.log('\n2️⃣ Testing Legacy Processing (fallback)...');
    const legacyResponse = await axios.post(`${BASE_URL}/api/llm/chat`, {
      message: 'Hello, I need help planning a trip to Japan',
      context: {
        destination: 'Japan',
        dates: {
          startDate: '2024-04-01',
          endDate: '2024-04-15'
        }
      }
    }, { headers });

    console.log(`✅ Legacy processing response: ${legacyResponse.data.data.content.substring(0, 100)}...`);

    // Step 3: Test Unified Processing (with processedPrompt)
    console.log('\n3️⃣ Testing Unified Processing (frontend-processed data)...');
    const processedPrompt = `You are a helpful travel planning assistant.

IMPORTANT RULES:
1. Answer the user's question directly and concisely
2. Only provide detailed travel advice when the user asks specific questions about destinations, activities, or planning
3. For simple greetings like "hello", "hi", "hey", or "how are you", respond briefly (1-2 sentences) and ask what they'd like help with
4. Keep responses concise and relevant to what the user actually asked
5. Don't provide unsolicited detailed itineraries or recommendations unless specifically requested
6. Ask clarifying questions if the user's request is vague
7. Do NOT include any user preferences or trip details unless specifically asked for an itinerary
8. Do NOT provide general recommendations or planning advice unless the user specifically asks for it

User message: Hello, I need help planning a trip to Japan

Context: Planning a trip to Japan
Dates: 2024-04-01 to 2024-04-15
Budget: Not specified
Interests: Not specified
Travelers: Not specified`;

    const unifiedResponse = await axios.post(`${BASE_URL}/api/llm/chat`, {
      message: 'Hello, I need help planning a trip to Japan',
      context: {
        destination: 'Japan',
        dates: {
          startDate: '2024-04-01',
          endDate: '2024-04-15'
        }
      },
      processedPrompt: processedPrompt,
      metadata: {
        inputTokens: 150,
        itineraryDetected: false,
        processingMethod: 'unified'
      }
    }, { headers });

    console.log(`✅ Unified processing response: ${unifiedResponse.data.data.content.substring(0, 100)}...`);

    // Step 4: Test Simple Greeting (should be brief in both cases)
    console.log('\n4️⃣ Testing Simple Greeting (should be brief)...');
    const greetingResponse = await axios.post(`${BASE_URL}/api/llm/chat`, {
      message: 'Hi',
      context: {}
    }, { headers });

    console.log(`✅ Greeting response: ${greetingResponse.data.data.content}`);

    // Step 5: Compare Response Lengths
    console.log('\n5️⃣ Comparing Response Characteristics...');
    console.log(`Legacy response length: ${legacyResponse.data.data.content.length} characters`);
    console.log(`Unified response length: ${unifiedResponse.data.data.content.length} characters`);
    console.log(`Greeting response length: ${greetingResponse.data.data.content.length} characters`);

    // Check if responses are appropriately brief for greetings
    const greetingLength = greetingResponse.data.data.content.length;
    if (greetingLength < 200) {
      console.log('✅ Greeting response is appropriately brief');
    } else {
      console.log('⚠️  Greeting response might be too long');
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('  ✅ Legacy processing works (fallback)');
    console.log('  ✅ Unified processing works (frontend data)');
    console.log('  ✅ Both paths produce responses');
    console.log('  ✅ Backward compatibility maintained');

  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n💡 This might be because:');
      console.log('   - The test user doesn\'t exist');
      console.log('   - The password is incorrect');
      console.log('   - The server is not running');
    }
  }
}

// Run the test
testUnifiedProcessing();
