import { getServerSession, isOnChainAdminOrCurator } from '@/server/auth/session'
import { reindexUntaggedPostsFromDb } from '@/server/db'
import { checkRateLimit, clientIpFromRequest } from '@/server/security/rate-limit'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const bodySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
    force: z.boolean().optional(),
  })
  .optional()

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`admin:reindex-visual:${ip}`, 10, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  // Strictly require verified SIWE session from an authorized admin wallet
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json(
      { ok: false, code: 'AUTH_REQUIRED', error: 'Sign-In With Ethereum session required' },
      { status: 401 },
    )
  }

  const allowed = await isOnChainAdminOrCurator(session.address)
  if (!allowed) {
    return NextResponse.json(
      { ok: false, code: 'FORBIDDEN_ROLE', error: 'Admin wallet required' },
      { status: 403 },
    )
  }

  let parsedBody: { limit?: number; force?: boolean } = {}
  try {
    const raw = await req.text()
    if (raw.trim()) {
      const parsed = bodySchema.safeParse(JSON.parse(raw))
      if (!parsed.success) {
        return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 })
      }
      parsedBody = parsed.data ?? {}
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const result = await reindexUntaggedPostsFromDb(parsedBody)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'reindex failed' },
      { status: 500 },
    )
  }
}
