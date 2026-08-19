# 🐛 Troubleshooting Slow Portal

## Current Issue
Portal is lagging and taking 4-5 seconds to load data with 14.5k students.

---

## ✅ Step 1: Verify Indexes Exist

Run this in **Supabase SQL Editor**:

```sql
SELECT 
    tablename,
    indexname
FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname LIKE 'idx_%'
ORDER BY tablename;
```

**Expected:** Should see 25-30 indexes including:
- `idx_students_college_id`
- `idx_students_created_at`
- `idx_users_email`
- `idx_users_college_id`

**If you see 0 indexes:** The SQL didn't run properly. Re-run `apply-indexes.sql`

---

## ✅ Step 2: Check If Indexes Are Being Used

Run this in **Supabase SQL Editor**:

```sql
EXPLAIN ANALYZE 
SELECT * FROM students 
ORDER BY "createdAt" DESC
LIMIT 1000;
```

**Look for:**
- ✅ GOOD: "Index Scan using idx_students_created_at"
- ❌ BAD: "Seq Scan on students" (means index not being used)

---

## ✅ Step 3: Update Database Statistics

Run this in **Supabase SQL Editor**:

```sql
ANALYZE students;
ANALYZE users;
ANALYZE colleges;
ANALYZE batches;
ANALYZE student_batches;
```

This helps PostgreSQL's query planner use the indexes properly.

---

## ✅ Step 4: Check Data Size

Run this in **Supabase SQL Editor**:

```sql
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    n_live_tup as row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
AND tablename IN ('students', 'users', 'colleges', 'batches')
ORDER BY n_live_tup DESC;
```

**Expected for 14.5k students:**
- students: ~14,500 rows, ~5-10 MB
- users: ~14,500 rows, ~3-5 MB

**If rows are way higher:** You might have duplicate data

---

## ⚡ Quick Fixes

### Fix 1: Clear Browser Cache
1. Press **Ctrl+Shift+R** (hard refresh)
2. Or open **Incognito/Private window**
3. Test portal there

### Fix 2: Restart Dev Server
```bash
# Stop current server (Ctrl+C)
cd lms-portal
npm run dev
```

### Fix 3: Check Connection Pool
Open `src/lib/prisma.ts` and verify:
```typescript
max: 20,  // Should be 20
min: 5,   // Should be 5
statement_timeout: 60000  // Should be 60000
```

---

## 📊 Performance Expectations

### With Indexes (Expected):
- **Initial page load:** 1-2 seconds
- **Dashboard:** 2-3 seconds
- **Students page:** 2-4 seconds

### Without Indexes (Current):
- **Initial page load:** 3-5 seconds ⚠️
- **Dashboard:** 4-6 seconds ⚠️
- **Students page:** 5-10 seconds ⚠️

---

## 🔍 Root Cause Analysis

Based on logs showing 4-5 second load times:

**Possible causes:**
1. ❌ Indexes not actually created (verify with Step 1)
2. ❌ Indexes not being used (check with Step 2)
3. ❌ Database statistics outdated (run Step 3)
4. ❌ Browser caching old slow version
5. ❌ Network latency to Supabase

---

## 🚀 Next Steps

1. **Run Step 1** - Verify indexes exist
2. **If no indexes:** Re-run `apply-indexes.sql` in Supabase
3. **Run Step 3** - Update statistics
4. **Restart dev server**
5. **Hard refresh browser** (Ctrl+Shift+R)
6. **Test again**

---

## 📞 Still Slow?

If portal is still slow after all steps:

### Check Network
Open browser **DevTools (F12)** → **Network tab**:
- Look for slow API calls (>5 seconds)
- Check if it's the query or network latency
- Filter by "Fetch/XHR"

### Check Database CPU
Go to **Supabase Dashboard** → **Database** → **Query Performance**:
- Look for slow queries
- Check if CPU is maxed out
- See if queries are using indexes

### Consider Virtual Scrolling
For 14.5k+ students in UI, use virtual scrolling:
```bash
npm install @tanstack/react-virtual
```

This renders only visible rows instead of all 14.5k DOM elements.

---

## ✅ Expected Result

After fixing:
- ✅ Dashboard loads in 1-2 seconds
- ✅ Students page loads in 2-3 seconds
- ✅ No lag or freezing
- ✅ Smooth scrolling

If you're still seeing 4-5+ seconds, the indexes likely aren't applied or being used!
