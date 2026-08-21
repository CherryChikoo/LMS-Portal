/**
 * 🔄 FORCE REFRESH CACHE - Paste this in browser console (F12)
 * 
 * This script will:
 * 1. Clear all old cache data
 * 2. Force reload from Supabase
 * 3. Show updated college counts
 */

console.log('🔄 Clearing cache and reloading fresh data...');

// Clear all localStorage and sessionStorage
localStorage.clear();
sessionStorage.clear();

console.log('✅ Cache cleared!');
console.log('🔄 Reloading page to fetch fresh data...');

// Reload page to fetch fresh data
setTimeout(() => {
  location.reload();
}, 500);
