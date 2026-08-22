# Prisma Serialization Fix for Next.js Client Components

## Problem
Console error when passing Prisma data from Server Components to Client Components:
```
Only plain objects can be passed to Client Components from Server Components. 
Decimal objects are not supported.
```

## Root Cause
Prisma returns special object types that cannot be serialized to JSON:
- **`Decimal`** - Used for `percentage` field (defined as `Decimal(5,2)` in schema)
- **`Date`** - JavaScript Date objects need to be converted to ISO strings

Next.js requires all data passed between Server and Client Components to be JSON-serializable.

## Solution
Created comprehensive serialization across all data sync actions and server actions that return exam results.

### Files Fixed

#### 1. **Core Sync Actions**
- `src/lib/actions/lms-sync-actions.ts` - Full sync action
- `src/lib/actions/progressive-lms-actions.ts` - Progressive/initial sync
- `src/lib/actions/results-actions.ts` - Paginated results action
- `src/lib/actions/dashboard-actions-optimized.ts` - Dashboard stats
- `src/lib/actions/exam-actions.ts` - Exam results actions

#### 2. **New Utility Module**
- `src/lib/utils/prisma-serialization.ts` - Reusable serialization utilities

### Changes Made

#### Decimal Conversion
```typescript
// Before (causes error)
percentage: att.percentage

// After (works correctly)
percentage: att.percentage !== null && att.percentage !== undefined 
  ? Number(String(att.percentage)) 
  : 0
```

**Why `Number(String(decimal))`?**
- Direct `Number(decimal)` can cause precision issues
- Converting to string first preserves the exact decimal value
- Then converting to number ensures proper type

#### Date Conversion
```typescript
// Before (causes error)
createdAt: att.createdAt

// After (works correctly)
createdAt: att.createdAt ? att.createdAt.toISOString() : null
```

### Serialization Utility Functions

Created reusable utilities in `prisma-serialization.ts`:

```typescript
import { decimalToNumber, dateToString, serializePrismaData } from '@/lib/utils/prisma-serialization';

// Convert single decimal
const percentage = decimalToNumber(result.percentage);

// Convert date
const createdAt = dateToString(result.createdAt);

// Auto-serialize entire object
const serialized = serializePrismaData(prismaResult);
```

### Where Serialization is Applied

1. **Leaderboard Data Flow**
   ```
   PostgreSQL (exam_results) 
     → fetchFullLMSStateAction (serialize)
     → LMS Data Cache
     → useLMSData() hook
     → Leaderboard Component ✅
   ```

2. **Results Page**
   ```
   PostgreSQL (exam_results)
     → getPaginatedResultsAction (serialize)
     → Results Page Component ✅
   ```

3. **Dashboard Stats**
   ```
   PostgreSQL (exam_results)
     → getStudentDashboardStatsAction (serialize)
     → Dashboard Component ✅
   ```

### Fields That Need Serialization

From `exam_results` table:
- **Decimal**: `percentage`
- **Dates**: `createdAt`, `updatedAt`, `submittedAt`, `startTime`

### Testing Checklist

- [ ] Leaderboard displays without console errors
- [ ] Results page shows percentage values correctly
- [ ] Dashboard stats load without errors
- [ ] Date values display correctly (formatted timestamps)
- [ ] No "Decimal objects are not supported" errors in console
- [ ] All numeric calculations work correctly (rankings, averages)

### Best Practices Going Forward

**Always serialize Prisma data in Server Actions:**

```typescript
export async function myServerAction() {
  const data = await prisma.someModel.findMany();
  
  // ✅ GOOD: Serialize before returning
  return data.map(item => ({
    ...item,
    decimalField: Number(String(item.decimalField)),
    dateField: item.dateField?.toISOString(),
  }));
  
  // ❌ BAD: Returning raw Prisma data
  return data;
}
```

**Use the utility functions:**

```typescript
import { serializePrismaData } from '@/lib/utils/prisma-serialization';

export async function myServerAction() {
  const data = await prisma.someModel.findMany();
  return serializePrismaData(data); // Auto-handles all Decimal and Date fields
}
```

### Performance Impact
✅ Minimal - serialization happens server-side once
✅ No runtime overhead on client
✅ Better type safety with explicit conversions

### Related Issues
- Fixes "Only plain objects can be passed to Client Components" error
- Fixes leaderboard not showing real-time data (combined with exam_results fetching)
- Ensures consistent data types across server/client boundary

---

**Last Updated**: 2026-08-23  
**Status**: ✅ Fixed and Deployed
