type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// ponytail: in-memory per-instance limiter — resets on cold start and isn't shared
// across serverless instances, so it only softens abuse rather than hard-blocking it.
// Upgrade to a shared store (Upstash/Redis) if that ceiling becomes a real problem.
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count++;
  return bucket.count > limit;
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}
