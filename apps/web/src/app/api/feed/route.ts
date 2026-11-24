import { fetchFeedPageFromDb } from '@/server/db'
import { checkRateLimit, clientIpFromRequest } from '@/server/security/rate-limit'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(256).optional(),
  filmId: z.coerce.number().int().min(1).max(100).optional(),
  printsOnly: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  sort: z.enum(['latest', 'popular']).default('latest'),
  q: z.string().trim().max(80).optional(),
})

export async function GET(req: Request) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`feed:get:${ip}`, 120, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { searchParams } = new URL(req.url)
  const parsed = querySchema.safeParse({
    limit: searchParams.get('limit') ?? undefined,
    cursor: searchParams.get('cursor') ?? undefined,
    filmId: searchParams.get('filmId') ?? undefined,
    printsOnly: searchParams.get('printsOnly') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
    q: searchParams.get('q') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid query parameters', issues: parsed.error.issues.slice(0, 3) },
      { status: 400 },
    )
  }

  try {
    const page = await fetchFeedPageFromDb(parsed.data)
    return NextResponse.json(
      {
        ok: true,
        items: page.items,
        nextCursor: page.nextCursor,
        totalCount: page.totalCount,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=30',
        },
      },
    )
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'feed query failed' },
      { status: 503 },
    )
  }
}
