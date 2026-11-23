import { getServerSession, isOnChainAdminOrCurator } from '@/server/auth/session'
import { applyDbMutation, fetchAppStateFromDb, getSql, type DbMutationPayload } from '@/server/db'
import { checkRateLimit, clientIpFromRequest } from '@/server/security/rate-limit'
import { claimedActorOf, dbMutationSchema } from '@/server/security/validate'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 750_000 // 750 KB hard cap

export async function GET(req: Request) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`state:get:${ip}`, 90, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  try {
    const data = await fetchAppStateFromDb()
    return NextResponse.json({ ok: true, dbConnected: true, ...data })
  } catch (err) {
    return NextResponse.json(
      { ok: false, dbConnected: false, error: err instanceof Error ? err.message : 'db error' },
      { status: 503 },
    )
  }
}

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req)
  const rlIp = checkRateLimit(`state:post:ip:${ip}`, 45, 60_000)
  if (!rlIp.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rlIp.retryAfterSec) } },
    )
  }

  // Enforce strict payload size cap before parsing JSON
  const contentLen = Number(req.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLen) && contentLen > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 })
  }

  const rawText = await req.text()
  if (rawText.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'Payload too large' }, { status: 413 })
  }

  let json: unknown
  try {
    json = JSON.parse(rawText)
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  // Strict Zod validation on every mutation shape & field
  const parsed = dbMutationSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Invalid payload', issues: parsed.error.issues.slice(0, 3) },
      { status: 400 },
    )
  }
  const payload = parsed.data

  // 1. Require a cryptographically verified SIWE session for all state mutations
  const session = await getServerSession()
  if (!session) {
    return NextResponse.json(
      { ok: false, code: 'AUTH_REQUIRED', error: 'Sign-In With Ethereum session required' },
      { status: 401 },
    )
  }

  // Per-wallet rate limit
  const rlWallet = checkRateLimit(`state:post:wallet:${session.address}`, 35, 60_000)
  if (!rlWallet.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Wallet rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rlWallet.retryAfterSec) } },
    )
  }

  // 2. Enforce strict actor ownership (prevent impersonation / IDOR)
  const claimedActor = claimedActorOf(payload)
  if (claimedActor && claimedActor !== session.address) {
    return NextResponse.json(
      { ok: false, code: 'FORBIDDEN_ACTOR', error: 'Actor address does not match signed session' },
      { status: 403 },
    )
  }

  // 3. Enforce on-chain Admin / Curator RBAC for audit mutations
  if (payload.type === 'audit.record' || payload.type === 'audit.remove') {
    const allowed = await isOnChainAdminOrCurator(session.address)
    if (!allowed) {
      return NextResponse.json(
        { ok: false, code: 'FORBIDDEN_ROLE', error: 'Admin or curator on-chain role required' },
        { status: 403 },
      )
    }
  }

  // 4. Enforce DB-level ownership for roll & pre-mint clear mutations
  try {
    const sql = getSql()
    if (payload.type === 'roll.shoot' || payload.type === 'roll.develop') {
      const rows = await sql`SELECT owner FROM public.rolls WHERE id = ${payload.rollId}`
      const owner = rows[0]?.owner ? String(rows[0].owner).toLowerCase() : null
      if (owner && owner !== session.address) {
        return NextResponse.json(
          { ok: false, code: 'NOT_ROLL_OWNER', error: 'You do not own this roll' },
          { status: 403 },
        )
      }
    }

    if (payload.type === 'print.preMintClear') {
      const rows =
        await sql`SELECT shooter FROM public.posts WHERE lower(photo_hash) = ${payload.photoHash}`
      const shooter = rows[0]?.shooter ? String(rows[0].shooter).toLowerCase() : null
      if (shooter && shooter !== session.address) {
        return NextResponse.json(
          { ok: false, code: 'NOT_PHOTOGRAPHER', error: 'Only photographer can accept pre-mint offers' },
          { status: 403 },
        )
      }
    }

    if (payload.type === 'print.upsert') {
      const pr = payload.print
      const latestEvent = pr.history[0]
      const authorizedActors = new Set(
        [pr.photographer, pr.owner, latestEvent?.actor].filter(Boolean).map((a) => a!.toLowerCase()),
      )
      if (!authorizedActors.has(session.address)) {
        return NextResponse.json(
          { ok: false, code: 'FORBIDDEN_PRINT', error: 'Session not authorized for this print action' },
          { status: 403 },
        )
      }
    }

    await applyDbMutation(payload as DbMutationPayload)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'mutation failed' },
      { status: 500 },
    )
  }
}
