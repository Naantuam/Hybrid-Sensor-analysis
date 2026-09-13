/**
 * Fast in-memory client-side cache for REST API responses
 * Provides instant 0ms state restoration when switching between devices and views
 */

const cacheStore = new Map();
const DEFAULT_TTL_MS = 60000; // 60 seconds

export function getApiCache(key) {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiry) {
    cacheStore.delete(key);
    return null;
  }
  return entry.data;
}

export function setApiCache(key, data, ttlMs = DEFAULT_TTL_MS) {
  if (data === undefined || data === null) return;
  cacheStore.set(key, {
    data,
    expiry: Date.now() + ttlMs,
    timestamp: Date.now()
  });
  return data;
}

export function invalidateApiCache(pattern = null) {
  if (!pattern) {
    cacheStore.clear();
    return;
  }
  for (const key of cacheStore.keys()) {
    if (typeof pattern === 'string' && (key.startsWith(pattern) || key.includes(pattern))) {
      cacheStore.delete(key);
    } else if (pattern instanceof RegExp && pattern.test(key)) {
      cacheStore.delete(key);
    }
  }
}

/**
 * High-performance cached fetch wrapper:
 * 1. Returns cached data immediately if available (0ms delay)
 * 2. Fetches fresh data from network in background
 * 3. Updates cache transparently
 */
export async function fetchWithCache(url, options = {}, ttlMs = DEFAULT_TTL_MS) {
  const cached = getApiCache(url);
  
  const fetchPromise = fetch(url, options)
    .then(async res => {
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setApiCache(url, data, ttlMs);
      return data;
    })
    .catch(err => {
      console.warn(`[Cache] Fetch failed for ${url}:`, err.message);
      if (cached) return cached;
      throw err;
    });

  return {
    cachedData: cached,
    freshPromise: fetchPromise
  };
}
