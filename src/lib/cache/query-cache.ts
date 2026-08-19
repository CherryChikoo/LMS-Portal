/**
 * QUERY RESULT CACHING WITH STALE-WHILE-REVALIDATE
 * 
 * Implements a multi-layer caching strategy:
 * 1. In-memory cache (fastest - instant access)
 * 2. Stale-while-revalidate (serve stale data, refresh in background)
 * 3. TTL-based invalidation (configurable per query type)
 * 
 * For 50k+ records, this eliminates repeated 4-5s database queries.
 */

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  staleAt: number;
  expiresAt: number;
};

type CacheConfig = {
  ttl: number; // Time to live (ms) - after this, data is stale
  staleTime: number; // Stale time (ms) - still usable but triggers background refresh
};

// Cache configurations by query type
const CACHE_CONFIGS: Record<string, CacheConfig> = {
  // Counts are fast to refresh, short TTL
  'dashboard-stats': { ttl: 30000, staleTime: 15000 }, // 30s TTL, 15s stale
  'student-count': { ttl: 60000, staleTime: 30000 }, // 1min TTL, 30s stale
  
  // Student data changes frequently, medium TTL
  'students-list': { ttl: 120000, staleTime: 60000 }, // 2min TTL, 1min stale
  'student-details': { ttl: 300000, staleTime: 150000 }, // 5min TTL, 2.5min stale
  
  // College/batch data changes infrequently, longer TTL
  'colleges-list': { ttl: 600000, staleTime: 300000 }, // 10min TTL, 5min stale
  'batches-list': { ttl: 600000, staleTime: 300000 }, // 10min TTL, 5min stale
  
  // Exam/resource data changes occasionally, medium TTL
  'exams-list': { ttl: 180000, staleTime: 90000 }, // 3min TTL, 1.5min stale
  'resources-list': { ttl: 180000, staleTime: 90000 }, // 3min TTL, 1.5min stale
};

// In-memory cache store
const cache = new Map<string, CacheEntry<any>>();

// Background refresh promises to avoid duplicate fetches
const refreshPromises = new Map<string, Promise<any>>();

/**
 * Generate cache key from query type and params
 */
function getCacheKey(queryType: string, params?: Record<string, any>): string {
  if (!params || Object.keys(params).length === 0) {
    return queryType;
  }
  
  // Sort keys for consistent cache keys
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${JSON.stringify(params[key])}`)
    .join('&');
  
  return `${queryType}:${sortedParams}`;
}

/**
 * Get cached data with stale-while-revalidate strategy
 */
export async function getCached<T>(
  queryType: string,
  params: Record<string, any> | undefined,
  fetcher: () => Promise<T>
): Promise<T> {
  const cacheKey = getCacheKey(queryType, params);
  const config = CACHE_CONFIGS[queryType] || { ttl: 120000, staleTime: 60000 };
  const now = Date.now();
  
  const cached = cache.get(cacheKey);
  
  // Cache hit - data is fresh
  if (cached && now < cached.staleAt) {
    return cached.data;
  }
  
  // Cache hit - data is stale but usable
  if (cached && now < cached.expiresAt) {
    // Return stale data immediately
    const staleData = cached.data;
    
    // Trigger background refresh if not already in progress
    if (!refreshPromises.has(cacheKey)) {
      const refreshPromise = fetcher()
        .then((freshData) => {
          // Update cache with fresh data
          cache.set(cacheKey, {
            data: freshData,
            timestamp: Date.now(),
            staleAt: Date.now() + config.staleTime,
            expiresAt: Date.now() + config.ttl,
          });
          refreshPromises.delete(cacheKey);
          return freshData;
        })
        .catch((err) => {
          console.error(`[CACHE] Background refresh failed for ${cacheKey}:`, err);
          refreshPromises.delete(cacheKey);
          return staleData; // Keep serving stale data on error
        });
      
      refreshPromises.set(cacheKey, refreshPromise);
    }
    
    return staleData;
  }
  
  // Cache miss or expired - fetch fresh data
  if (refreshPromises.has(cacheKey)) {
    // Another request is already fetching, wait for it
    return await refreshPromises.get(cacheKey)!;
  }
  
  const fetchPromise = fetcher()
    .then((data) => {
      // Store in cache
      cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        staleAt: Date.now() + config.staleTime,
        expiresAt: Date.now() + config.ttl,
      });
      refreshPromises.delete(cacheKey);
      return data;
    })
    .catch((err) => {
      refreshPromises.delete(cacheKey);
      throw err;
    });
  
  refreshPromises.set(cacheKey, fetchPromise);
  return await fetchPromise;
}

/**
 * Invalidate cache for a specific query or pattern
 */
export function invalidateCache(queryType?: string, params?: Record<string, any>) {
  if (!queryType) {
    // Clear entire cache
    cache.clear();
    refreshPromises.clear();
    return;
  }
  
  if (params) {
    // Invalidate specific query
    const cacheKey = getCacheKey(queryType, params);
    cache.delete(cacheKey);
    refreshPromises.delete(cacheKey);
  } else {
    // Invalidate all queries of this type
    const prefix = `${queryType}:`;
    for (const key of cache.keys()) {
      if (key === queryType || key.startsWith(prefix)) {
        cache.delete(key);
        refreshPromises.delete(key);
      }
    }
  }
}

/**
 * Get cache statistics (for debugging)
 */
export function getCacheStats() {
  const now = Date.now();
  let freshCount = 0;
  let staleCount = 0;
  let expiredCount = 0;
  
  for (const entry of cache.values()) {
    if (now < entry.staleAt) {
      freshCount++;
    } else if (now < entry.expiresAt) {
      staleCount++;
    } else {
      expiredCount++;
    }
  }
  
  return {
    totalEntries: cache.size,
    freshEntries: freshCount,
    staleEntries: staleCount,
    expiredEntries: expiredCount,
    activeRefreshes: refreshPromises.size,
  };
}

/**
 * Cleanup expired entries (run periodically)
 */
export function cleanupExpiredCache() {
  const now = Date.now();
  let removedCount = 0;
  
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      cache.delete(key);
      removedCount++;
    }
  }
  
  return removedCount;
}

// Run cleanup every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(cleanupExpiredCache, 5 * 60 * 1000);
}

/**
 * Prefetch data into cache (for anticipatory loading)
 */
export async function prefetchCache<T>(
  queryType: string,
  params: Record<string, any> | undefined,
  fetcher: () => Promise<T>
): Promise<void> {
  const cacheKey = getCacheKey(queryType, params);
  
  // Only prefetch if not already cached or in progress
  if (!cache.has(cacheKey) && !refreshPromises.has(cacheKey)) {
    getCached(queryType, params, fetcher).catch(() => {
      // Ignore prefetch errors
    });
  }
}
