type CacheEntry<T> = {
    data: T;
    updatedAt: number;
    expiresAt: number;
};

const CACHE_PREFIX = 'storyboard_cache:';
const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflightRequests = new Map<string, Promise<unknown>>();
const DEFAULT_TTL_MS = 30_000;

const getStorageKey = (key: string) => `${CACHE_PREFIX}${key}`;

const loadEntryFromSession = <T>(key: string): CacheEntry<T> | null => {
    try {
        const raw = sessionStorage.getItem(getStorageKey(key));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CacheEntry<T>;
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
};

const persistEntry = <T>(key: string, entry: CacheEntry<T>) => {
    memoryCache.set(key, entry as CacheEntry<unknown>);
    try {
        sessionStorage.setItem(getStorageKey(key), JSON.stringify(entry));
    } catch {
        // Session storage is best effort only.
    }
};

const readEntry = <T>(key: string): CacheEntry<T> | null => {
    const memoryEntry = memoryCache.get(key) as CacheEntry<T> | undefined;
    if (memoryEntry) return memoryEntry;

    const sessionEntry = loadEntryFromSession<T>(key);
    if (!sessionEntry) return null;
    memoryCache.set(key, sessionEntry as CacheEntry<unknown>);
    return sessionEntry;
};

export const readCachedData = <T>(key: string): T | null => {
    const entry = readEntry<T>(key);
    return entry ? entry.data : null;
};

export const setCachedData = <T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS) => {
    const now = Date.now();
    persistEntry(key, {
        data,
        updatedAt: now,
        expiresAt: now + ttlMs
    });
};

export const invalidateCache = (key: string) => {
    memoryCache.delete(key);
    inflightRequests.delete(key);
    try {
        sessionStorage.removeItem(getStorageKey(key));
    } catch {
        // Ignore storage failures.
    }
};

export const invalidateCachePrefix = (prefix: string) => {
    const storagePrefix = getStorageKey(prefix);

    Array.from(memoryCache.keys()).forEach((key) => {
        if (key.startsWith(prefix)) {
            memoryCache.delete(key);
        }
    });

    Array.from(inflightRequests.keys()).forEach((key) => {
        if (key.startsWith(prefix)) {
            inflightRequests.delete(key);
        }
    });

    try {
        for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
            const storageKey = sessionStorage.key(i);
            if (storageKey && storageKey.startsWith(storagePrefix)) {
                sessionStorage.removeItem(storageKey);
            }
        }
    } catch {
        // Ignore storage failures.
    }
};

export const fetchCachedJson = async <T>(
    key: string,
    input: RequestInfo | URL,
    init?: RequestInit,
    options?: { ttlMs?: number; forceRefresh?: boolean }
): Promise<T> => {
    const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
    const forceRefresh = options?.forceRefresh ?? false;
    const now = Date.now();
    const existing = readEntry<T>(key);

    if (!forceRefresh && existing && existing.expiresAt > now) {
        return existing.data;
    }

    const inflight = inflightRequests.get(key) as Promise<T> | undefined;
    if (inflight) return inflight;

    const request = fetch(input, init)
        .then(async (res) => {
            if (!res.ok) {
                throw new Error(`Request failed: ${res.status}`);
            }
            return res.json() as Promise<T>;
        })
        .then((data) => {
            setCachedData(key, data, ttlMs);
            return data;
        })
        .finally(() => {
            inflightRequests.delete(key);
        });

    inflightRequests.set(key, request as Promise<unknown>);
    return request;
};
