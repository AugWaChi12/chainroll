import { getServerSession, isOnChainAdminOrCurator } from '@/server/auth/session'
import {
  applyAdminActionInDb,
  fetchAdminDashboardFromDb,
  type AdminActionPayload,
} from '@/server/db'
import { checkRateLimit, clientIpFromRequest } from '@/server/security/rate-limit'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const evmAddr = z.string().regex(/^0x[a-fA-F0-9]{40}$/)

const adminActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('moderation.decide'),
    reportId: z.string().min(1).max(64),
    postId: z.string().min(1).max(64),
    shooter: evmAddr,
    decision: z.enum(['pending', 'approved', 'hidden', 'banned']),
    note: z.string().max(240).optional(),
  }),
  z.object({
    type: z.literal('post.bulkHide'),
    postIds: z.array(z.string().min(1).max(64)).min(1).max(50),
    note: z.string().max(240).optional(),
  }),
  z.object({
    type: z.literal('user.setBan'),
    address: evmAddr,
    banned: z.boolean(),
    note: z.string().max(240).optional(),
  }),
  z.object({
    type: z.literal('user.resetStreak'),
    address: evmAddr,
  }),
])

export async function GET(req: Request) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`admin:get:${ip}`, 60, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  try {
    const dashboard = await fetchAdminDashboardFromDb()
    return NextResponse.json({ ok: true, ...dashboard })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'admin query failed' },
      { status: 503 },
    )
  }
}

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`admin:post:${ip}`, 30, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = adminActionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid admin action', issues: parsed.error.issues.slice(0, 3) },
      { status: 400 },
    )
  }

  // Require verified SIWE session + on-chain DEFAULT_ADMIN_ROLE / CURATOR_ROLE
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
      { ok: false, code: 'FORBIDDEN_ROLE', error: 'On-chain admin or curator role required' },
      { status: 403 },
    )
  }

  try {
    await applyAdminActionInDb(parsed.data as AdminActionPayload, session.address)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'admin action failed' },
      { status: 500 },
    )
  }
}
