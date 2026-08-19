# Testing Guide for 50K+ Student Performance

## 🎯 Testing Objectives
1. Verify no "Page Unresponsive" errors with 50k students
2. Measure actual load times and compare with targets
3. Validate all features work with large datasets
4. Test concurrent user load

---

## 📋 Manual Testing Checklist

### Test 1: Dashboard Performance ✅
**Current Dataset:** 14.5k students

**Steps:**
1. Navigate to `/admin` (dashboard)
2. Measure load time in browser DevTools
3. Check for "Page Unresponsive" dialog
4. Verify counts display correctly

**Expected Results:**
- Load time: < 1 second
- No browser freezing
- Accurate counts displayed
- Smooth interactions

**Actual Results (to be filled):**
- Load time: _____ ms
- Freezing: Yes/No
- Counts accurate: Yes/No
- Notes: _______________

### Test 2: Students Page Initial Load ✅
**Steps:**
1. Navigate to `/admin/students`
2. Measure time until first students visible
3. Check browser DevTools Network tab
4. Verify virtual scrolling active

**Expected Results:**
- Initial load: < 1 second
- First 100 students visible
- Progress indicator showing
- Virtual table rendering

**Actual Results:**
- Load time: _____ ms
- Students visible: _____
- Progress bar: Yes/No
- Notes: _______________

### Test 3: Infinite Scroll Performance ✅
**Steps:**
1. On `/admin/students`, scroll down continuously
2. Monitor FPS in browser DevTools Performance tab
3. Check memory usage in Task Manager
4. Scroll to bottom (load all students)

**Expected Results:**
- Smooth 60fps scrolling
- Memory stays < 500MB
- All students eventually loaded
- No browser freezing

**Actual Results:**
- Scroll FPS: _____ fps
- Memory usage: _____ MB
- All loaded: Yes/No
- Notes: _______________

### Test 4: Search/Filter Performance ✅
**Steps:**
1. In search box, type "test" (server-side search)
2. Measure response time
3. Change college filter
4. Change department filter
5. Apply multiple filters simultaneously

**Expected Results:**
- Search response: < 500ms
- Filter response: < 500ms
- No client-side lag
- Results accurate

**Actual Results:**
- Search time: _____ ms
- Filter time: _____ ms
- Lag: Yes/No
- Notes: _______________

### Test 5: Cache Performance ✅
**Steps:**
1. Visit `/admin/students` (first time)
2. Navigate to `/admin` (dashboard)
3. Navigate back to `/admin/students` (cached)
4. Measure load time difference

**Expected Results:**
- First load: 500-1000ms
- Cached load: < 50ms
- Instant UI display

**Actual Results:**
- First load: _____ ms
- Cached load: _____ ms
- Improvement: _____x
- Notes: _______________

### Test 6: Virtual Scrolling Validation ✅
**Steps:**
1. On `/admin/students`, open browser DevTools Elements
2. Count actual `<tr>` elements in DOM
3. Scroll down and count again
4. Check if count remains constant

**Expected Results:**
- DOM elements: ~30 rows (constant)
- Not 14,500 rows
- Virtual rendering active

**Actual Results:**
- DOM rows: _____
- Increases on scroll: Yes/No
- Virtual active: Yes/No
- Notes: _______________

---

## 🔬 Performance Measurement Tools

### Browser DevTools Performance Tab
```
1. Open DevTools (F12)
2. Go to Performance tab
3. Click Record (red circle)
4. Navigate to /admin/students
5. Wait for page to load
6. Stop recording
7. Analyze:
   - Scripting time
   - Rendering time
   - Idle time
   - FPS graph
```

### Network Tab Analysis
```
1. Open DevTools Network tab
2. Navigate to page
3. Check:
   - Request count
   - Total payload size
   - Waterfall timing
   - Largest requests
```

### Memory Profiling
```
1. Open DevTools Memory tab
2. Take heap snapshot before load
3. Load students page
4. Take heap snapshot after load
5. Compare memory usage
6. Check for memory leaks
```

### Lighthouse Audit
```bash
# Run from Chrome DevTools
1. Open DevTools
2. Go to Lighthouse tab
3. Select "Performance"
4. Click "Analyze page load"
5. Review scores and recommendations
```

---

## 📊 Performance Benchmarks

### Target Metrics (50k Students)
| Metric | Target | Priority |
|--------|--------|----------|
| Dashboard load | < 500ms | Critical |
| Students initial load | < 1s | Critical |
| Search response | < 500ms | High |
| Filter response | < 500ms | High |
| Scroll FPS | 55+ fps | High |
| Memory usage | < 500MB | Medium |
| Cache hit time | < 50ms | Medium |

### Actual Measurements (14.5k Students)
| Metric | Measured | Status |
|--------|----------|--------|
| Dashboard load | _____ ms | ⏳ Pending |
| Students initial load | _____ ms | ⏳ Pending |
| Search response | _____ ms | ⏳ Pending |
| Filter response | _____ ms | ⏳ Pending |
| Scroll FPS | _____ fps | ⏳ Pending |
| Memory usage | _____ MB | ⏳ Pending |
| Cache hit time | _____ ms | ⏳ Pending |

---

## 🧪 Load Testing with k6

### Install k6
```bash
# Windows (chocolatey)
choco install k6

# macOS
brew install k6

# Or download from https://k6.io/
```

### Basic Load Test Script
Create `load-test.js`:
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 10 },  // Ramp up to 10 users
    { duration: '1m', target: 10 },   // Stay at 10 users
    { duration: '30s', target: 50 },  // Ramp up to 50 users
    { duration: '1m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 0 },   // Ramp down
  ],
};

export default function () {
  // Test dashboard
  let dashRes = http.get('http://localhost:3000/admin');
  check(dashRes, {
    'dashboard loads': (r) => r.status === 200,
    'dashboard loads fast': (r) => r.timings.duration < 1000,
  });

  sleep(1);

  // Test students page
  let studentsRes = http.get('http://localhost:3000/admin/students');
  check(studentsRes, {
    'students page loads': (r) => r.status === 200,
    'students loads fast': (r) => r.timings.duration < 2000,
  });

  sleep(2);
}
```

### Run Load Test
```bash
cd lms-portal
k6 run load-test.js
```

### Expected Results
```
✓ dashboard loads: 100%
✓ dashboard loads fast: >95%
✓ students page loads: 100%
✓ students loads fast: >90%

http_req_duration: avg=450ms max=1.2s
```

---

## 🎮 Browser-Based Performance Testing

### Create Performance Test Page
Create `lms-portal/src/app/admin/performance-test/page.tsx`:

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getStudentsInfiniteAction, getStudentCountWithFiltersAction } from "@/lib/actions/student-actions-optimized";
import { getAdminDashboardStatsAction } from "@/lib/actions/dashboard-actions-optimized";

export default function PerformanceTestPage() {
  const [results, setResults] = useState<any[]>([]);

  const runTest = async (name: string, fn: () => Promise<any>) => {
    const start = performance.now();
    try {
      await fn();
      const duration = performance.now() - start;
      setResults(prev => [...prev, { name, duration: Math.round(duration), status: 'pass' }]);
    } catch (err) {
      const duration = performance.now() - start;
      setResults(prev => [...prev, { name, duration: Math.round(duration), status: 'fail', error: err }]);
    }
  };

  const runAllTests = async () => {
    setResults([]);
    
    // Test 1: Dashboard stats
    await runTest("Dashboard Stats", () => getAdminDashboardStatsAction());
    
    // Test 2: Student count
    await runTest("Student Count", () => getStudentCountWithFiltersAction({}));
    
    // Test 3: First page of students
    await runTest("Students Page 0", () => getStudentsInfiniteAction({}, 0));
    
    // Test 4: Second page (test caching)
    await runTest("Students Page 1", () => getStudentsInfiniteAction({}, 1));
    
    // Test 5: Filtered students
    await runTest("Students Filtered", () => getStudentsInfiniteAction({ search: "test" }, 0));
    
    // Test 6: Cached dashboard (should be instant)
    await runTest("Dashboard Stats (cached)", () => getAdminDashboardStatsAction());
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Performance Test Suite</h1>
        <p className="text-muted-foreground">Measure actual query performance</p>
      </div>

      <Button onClick={runAllTests}>Run All Tests</Button>

      {results.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 text-left">Test</th>
                <th className="p-3 text-left">Duration</th>
                <th className="p-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, i) => (
                <tr key={i} className="border-t">
                  <td className="p-3">{result.name}</td>
                  <td className="p-3 font-mono">{result.duration}ms</td>
                  <td className="p-3">
                    <span className={result.status === 'pass' ? 'text-green-600' : 'text-red-600'}>
                      {result.status === 'pass' ? '✓ Pass' : '✗ Fail'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

Visit: http://localhost:3000/admin/performance-test

---

## 🔍 Database Performance Testing

### Check Query Execution Plans
```sql
-- Test student count query
EXPLAIN ANALYZE 
SELECT COUNT(*) FROM students WHERE is_deleted IS NOT TRUE;

-- Test paginated query
EXPLAIN ANALYZE 
SELECT * FROM students 
WHERE is_deleted IS NOT TRUE 
ORDER BY created_at DESC 
LIMIT 100;

-- Test filtered query
EXPLAIN ANALYZE 
SELECT * FROM students 
WHERE is_deleted IS NOT TRUE 
AND college_id = 'some-college-id' 
LIMIT 100;
```

### Expected Results
```
- Seq Scan: ❌ Bad (full table scan)
- Index Scan: ✅ Good (using indexes)
- Bitmap Heap Scan: ✅ Good (efficient)

Execution time: < 100ms for 50k records
```

### Check Index Usage
```sql
-- View all indexes
SELECT * FROM pg_indexes WHERE tablename = 'students';

-- Check index usage stats
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'students';
```

---

## 📈 Monitoring in Production

### Key Metrics to Track
1. **Page Load Time** (from browser timing API)
2. **Database Query Time** (from Prisma logs)
3. **Cache Hit Rate** (from getCacheStats())
4. **Error Rate** (from error logs)
5. **Concurrent Users** (from server logs)

### Add Performance Monitoring
```typescript
// In your optimized actions, add timing logs
const start = Date.now();
const result = await prisma.students.findMany(...);
const duration = Date.now() - start;
console.log(`[PERF] students query: ${duration}ms`);
```

### Cache Statistics Endpoint
Create `lms-portal/src/app/api/cache-stats/route.ts`:
```typescript
import { getCacheStats } from '@/lib/cache/query-cache';

export async function GET() {
  const stats = getCacheStats();
  return Response.json(stats);
}
```

Visit: http://localhost:3000/api/cache-stats

---

## ✅ Success Criteria

### Must Pass (Critical)
- [ ] No "Page Unresponsive" errors with 50k students
- [ ] Dashboard loads in < 1 second
- [ ] Students page initial load < 1 second
- [ ] Smooth 55+ fps scrolling
- [ ] Search/filter response < 500ms

### Should Pass (High Priority)
- [ ] Memory usage stays < 500MB
- [ ] Cache hit time < 50ms
- [ ] Can handle 50 concurrent users
- [ ] All features work with 50k dataset

### Nice to Have (Medium Priority)
- [ ] Dashboard loads in < 500ms
- [ ] Students page initial load < 500ms
- [ ] Cache hit rate > 90%
- [ ] Can handle 100 concurrent users

---

## 🐛 Common Issues and Solutions

### Issue: Students page still slow
**Diagnosis:**
- Check Network tab - are pagination queries being made?
- Check if virtual scrolling is active (DOM element count)

**Solution:**
- Verify page is using optimized component
- Check `useInfiniteStudents` hook is being called
- Ensure `VirtualizedStudentTable` is rendering

### Issue: Cache not working
**Diagnosis:**
- Check browser console for cache logs
- Visit `/api/cache-stats` to see cache state

**Solution:**
- Verify `getCached` is being called in actions
- Check TTL values aren't too short
- Clear browser cache and retry

### Issue: High memory usage
**Diagnosis:**
- Check if all students are being loaded at once
- Check if virtual scrolling is disabled

**Solution:**
- Verify pagination is working (max 100 per request)
- Check virtual table renders only visible rows
- Look for memory leaks in React DevTools

---

## 📝 Test Results Template

Copy this for your testing session:

```
=== PERFORMANCE TEST RESULTS ===
Date: ____________________
Dataset Size: _____ students
Tester: ____________________

DASHBOARD:
- Load time: _____ ms
- Memory: _____ MB
- Freezing: Yes/No
- Notes: _______________

STUDENTS PAGE:
- Initial load: _____ ms
- Scroll FPS: _____ fps
- Search time: _____ ms
- Filter time: _____ ms
- Memory: _____ MB
- Notes: _______________

CACHING:
- First load: _____ ms
- Cached load: _____ ms
- Hit rate: _____ %
- Notes: _______________

ISSUES FOUND:
1. _______________
2. _______________
3. _______________

OVERALL STATUS: ✅ Pass / ⚠️ Issues / ❌ Fail
```

---

## 🚀 Next Steps

1. **Test with current dataset (14.5k)**
   - Fill out manual testing checklist
   - Run performance measurement tools
   - Document baseline metrics

2. **Simulate 50k dataset**
   - Import additional test data
   - Re-run all tests
   - Compare with targets

3. **Load testing**
   - Run k6 load tests
   - Test with 10, 25, 50 concurrent users
   - Monitor database and server resources

4. **Production deployment**
   - Deploy optimized version
   - Monitor real user metrics
   - Set up alerts for slow pages

---

**Ready to test!** Start with the manual checklist above and measure actual performance.
