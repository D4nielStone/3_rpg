export function createRateLimiter({ limit, windowMs, maxEntries = 10_000 }) {
  const entries = new Map();

  return (key) => {
    const now = Date.now();
    if (entries.size >= maxEntries && !entries.has(key)) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey !== undefined) entries.delete(oldestKey);
    }
    const entry = entries.get(key);
    if (!entry || now - entry.startedAt >= windowMs) {
      entries.set(key, { startedAt: now, count: 1 });
      return true;
    }
    if (entry.count >= limit) return false;
    entry.count += 1;
    return true;
  };
}
