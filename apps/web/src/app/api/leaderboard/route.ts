import { fetchLeaderboardFromDb } from '@/server/db'
import { checkRateLimit, clientIpFromRequest } from '@/server/security/rate-limit'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`leaderboard:get:${ip}`, 90, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  try {
    const data = await fetchLeaderboardFromDb()
    return NextResponse.json(
      { ok: true, ...data },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        },
      },
    )
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'leaderboard failed' },
      { status: 503 },
    )
  }
}
