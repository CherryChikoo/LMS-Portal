/**
 * One-time script to sync all college student counts
 * 
 * Usage:
 * 1. Make sure you're logged in to the LMS Portal in your browser
 * 2. Open browser console on any LMS page
 * 3. Copy and paste this entire script
 * 4. Press Enter
 * 
 * The script will:
 * - Get your auth token from Supabase
 * - Call the sync API endpoint
 * - Display results
 */

(async function syncCollegeCounts() {
  console.log('🔄 Starting college count sync...');
  
  try {
    // Get Supabase client from window
    const supabase = window.supabase || (await import('@supabase/supabase-js')).createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    // Get current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      console.error('❌ Not authenticated. Please log in first.');
      return;
    }
    
    console.log('✅ Authenticated as:', session.user.email);
    console.log('🔄 Calling sync endpoint...');
    
    // Call the sync API
    const response = await fetch('/api/admin/sync-college-counts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (response.ok && result.success) {
      console.log('✅ Sync completed successfully!');
      console.log(`📊 Total colleges: ${result.totalColleges}`);
      console.log(`🔄 Updated colleges: ${result.updatedColleges}`);
      
      if (result.updates && result.updates.length > 0) {
        console.log('\n📋 Updates made:');
        console.table(result.updates);
      } else {
        console.log('✨ All counts were already correct!');
      }
      
      // Refresh the page to show updated counts
      console.log('\n🔄 Refreshing page to show updated counts...');
      setTimeout(() => window.location.reload(), 2000);
    } else {
      console.error('❌ Sync failed:', result.error || result.message);
      if (result.details) {
        console.error('Details:', result.details);
      }
    }
    
  } catch (error) {
    console.error('❌ Error during sync:', error);
  }
})();
