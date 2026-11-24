import { fetchLiveActivityFromDb } from '@/server/db'
import { checkRateLimit, clientIpFromRequest } from '@/server/security/rate-limit'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  limit: z.coerce.number().int().min(5).max(80).default(40),
})

export async function GET(req: Request) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`activity:get:${ip}`, 90, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { searchParams } = new URL(req.url)
  const parsed = querySchema.safeParse({
    limit: searchParams.get('limit') ?? undefined,
  })
  const limit = parsed.success ? parsed.data.limit : 40

  try {
    const items = await fetchLiveActivityFromDb(limit)
    return NextResponse.json(
      { ok: true, items },
      { headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=20' } },
    )
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'activity query failed' },
      { status: 503 },
    )
  }
}
