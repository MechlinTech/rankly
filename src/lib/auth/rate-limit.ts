/**
 * In-memory, single-process rate limiter. Adequate for local/dev and a single-instance
 * deployment; will NOT work correctly behind multiple app instances/load balancers, since
 * each process has its own counters. Replace with a shared store (Redis) before scaling
 * horizontally — tracked in KNOWN_LIMITATIONS.md.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}
