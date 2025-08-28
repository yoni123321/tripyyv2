const emailService = require('./src/services/email-service');

async function testEmailService() {
  console.log('🧪 Testing Email Service...\n');
  
  // Test 1: Check service status
  console.log('📊 Service Status:');
  const status = emailService.getStatus();
  console.log(JSON.stringify(status, null, 2));
  
  // Test 2: Test verification email (will be logged in dev mode)
  console.log('\n📧 Testing Verification Email...');
  try {
    const result = await emailService.sendVerificationEmail(
      'test@example.com',
      'test-token-123',
      'Test User'
    );
    console.log('✅ Verification email result:', result);
  } catch (error) {
    console.error('❌ Verification email error:', error);
  }
  
  // Test 3: Test welcome email
  console.log('\n📧 Testing Welcome Email...');
  try {
    const result = await emailService.sendWelcomeEmail(
      'test@example.com',
      'Test User'
    );
    console.log('✅ Welcome email result:', result);
  } catch (error) {
    console.error('❌ Welcome email error:', error);
  }
  
  // Test 4: Test password reset email
  console.log('\n📧 Testing Password Reset Email...');
  try {
    const result = await emailService.sendPasswordResetEmail(
      'test@example.com',
      'reset-token-123',
      'Test User'
    );
    console.log('✅ Password reset email result:', result);
  } catch (error) {
    console.error('❌ Password reset email error:', error);
  }
  
  console.log('\n🎉 Email service testing completed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  testEmailService().catch(console.error);
}

module.exports = { testEmailService };
