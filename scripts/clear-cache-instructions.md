# Clear LMS Cache - Instructions

## Problem
The LMS portal caches student data in `localStorage` with key `lms_data_cache_v5`. After database updates (like status changes), the UI may show stale cached data until the cache refreshes.

## Solution: Clear Browser Cache

### Option 1: Clear Specific LMS Cache (Quick)
1. Open browser DevTools (`F12` or `Right-click → Inspect`)
2. Go to **Console** tab
3. Run this command:
```javascript
localStorage.removeItem('lms_data_cache_v5');
location.reload();
```

### Option 2: Hard Refresh (Medium)
- **Windows/Linux**: `Ctrl + Shift + R`
- **Mac**: `Cmd + Shift + R`

### Option 3: Clear All Site Data (Nuclear)
1. Open DevTools (`F12`)
2. Go to **Application** tab (Chrome) or **Storage** tab (Firefox)
3. Click **Clear storage** or **Clear site data**
4. Refresh the page

### Option 4: Incognito/Private Mode (Testing)
- Open a new incognito/private window
- The cache won't exist there, so you'll see fresh data

## Technical Details

### Cache Location
- **Key**: `lms_data_cache_v5`
- **Storage**: `localStorage`
- **TTL**: 60 seconds (automatically refreshes after 1 minute)

### Cache Structure
```javascript
{
  colleges: { data: [...], updatedAt: timestamp },
  batches: { data: [...], updatedAt: timestamp },
  students: { data: [...], updatedAt: timestamp },
  exams: { data: [...], updatedAt: timestamp },
  resources: { data: [...], updatedAt: timestamp }
}
```

### Status Source of Truth
- **Database**: `users.status` (primary source)
- **Display**: Always read from `users.status`, never `students.status`
- **Sync**: Both tables are kept in sync by the backend

## After Making Database Changes

If you run database scripts (like `sync-student-status.mjs` or `sync-status-tables.mjs`), clear the cache to see the changes:

```bash
# 1. Run the sync script
node scripts/sync-status-tables.mjs

# 2. Clear cache in browser console
localStorage.removeItem('lms_data_cache_v5');
location.reload();
```

## Automated Cache Refresh

The cache automatically refreshes:
- Every 60 seconds (TTL check)
- When a database change is detected (Supabase realtime)
- When `refreshCache()` is called in the code

However, if you see stale data, manually clearing is the fastest solution.
