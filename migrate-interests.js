const { pool } = require('./src/config/database');

async function migrateInterests() {
  try {
    console.log('🚀 Starting interests data migration...');
    
    // Get all users
    const usersResult = await pool.query('SELECT id, email, traveler_profile FROM users');
    const users = usersResult.rows;
    
    console.log(`📊 Found ${users.length} users to process`);
    
    let updatedCount = 0;
    
    for (const user of users) {
      const travelerProfile = user.traveler_profile || {};
      
      // Check if interests field exists and is properly populated
      if (!travelerProfile.interests || !Array.isArray(travelerProfile.interests)) {
        console.log(`⚠️ User ${user.email} has invalid interests field:`, travelerProfile.interests);
        
        // Initialize interests as empty array if missing
        const updatedProfile = {
          ...travelerProfile,
          interests: Array.isArray(travelerProfile.interests) ? travelerProfile.interests : []
        };
        
        // Update user in database
        await pool.query(
          'UPDATE users SET traveler_profile = $1 WHERE id = $2',
          [JSON.stringify(updatedProfile), user.id]
        );
        
        updatedCount++;
        console.log(`✅ Updated user ${user.email} with proper interests field`);
      } else {
        console.log(`✅ User ${user.email} already has valid interests:`, travelerProfile.interests);
      }
    }
    
    console.log(`🎉 Migration completed! Updated ${updatedCount} users`);
    
    // Verify the migration
    console.log('\n🔍 Verifying migration...');
    const verifyResult = await pool.query('SELECT email, traveler_profile->\'interests\' as interests FROM users');
    
    verifyResult.rows.forEach(row => {
      console.log(`👤 ${row.email}: interests = ${JSON.stringify(row.interests)}`);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    await pool.end();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateInterests();
}

module.exports = { migrateInterests };
