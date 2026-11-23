import 'server-only'

/**
 * In-memory sliding-window rate limiter keyed by IP / wallet + bucket.
 * Suitable for single-node VPS / Docker deployments; returns standard retry metadata.
 */

type Entry = { timestamps: number[] }
const buckets = new Map<string, Entry>()

// Periodic GC so long-running server memory stays bounded
const globalForRl = globalThis as unknown as { __chainrollRlGc?: boolean }
if (!globalForRl.__chainrollRlGc) {
  globalForRl.__chainrollRlGc = true
  setInterval(() => {
    const cutoff = Date.now() - 5 * 60_000
    for (const [key, entry] of buckets.entries()) {
      const kept = entry.timestamps.filter((t) => t > cutoff)
      if (kept.length === 0) buckets.delete(key)
      else entry.timestamps = kept
    }
  }, 60_000).unref?.()
}

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now()
  const cutoff = now - windowMs
  const cur = buckets.get(key) ?? { timestamps: [] }
  const recent = cur.timestamps.filter((t) => t > cutoff)

  if (recent.length >= limit) {
    const oldest = recent[0] ?? now
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000))
    buckets.set(key, { timestamps: recent })
    return { allowed: false, remaining: 0, retryAfterSec }
  }

  recent.push(now)
  buckets.set(key, { timestamps: recent })
  return {
    allowed: true,
    remaining: Math.max(0, limit - recent.length),
    retryAfterSec: 0,
  }
}

export function clientIpFromRequest(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  return req.headers.get('x-real-ip')?.trim() || '127.0.0.1'
}
