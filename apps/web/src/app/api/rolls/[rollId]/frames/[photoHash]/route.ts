import { getServerSession } from '@/server/auth/session'
import { fetchSyncedShotKey, verifyRollOwner } from '@/server/db'
import { checkRateLimit, clientIpFromRequest } from '@/server/security/rate-limit'
import { getR2Config, signR2PresignedUrl } from '@/server/storage/r2'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const HASH_RE = /^0x[0-9a-fA-F]{64}$/

/**
 * GET /api/rolls/[rollId]/frames/[photoHash]
 * Streams a private R2 frame image back to its authenticated owner (same-origin so Canvas/Contact Sheet works without CORS issues).
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ rollId: string; photoHash: string }> },
) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`roll-frame-img:${ip}`, 180, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const session = await getServerSession()
  if (!session) {
    return NextResponse.json({ ok: false, error: 'SIWE session required' }, { status: 401 })
  }

  const { rollId: rawRollId, photoHash } = await context.params
  if (!/^\d+$/.test(rawRollId) || !HASH_RE.test(photoHash)) {
    return NextResponse.json({ ok: false, error: 'Invalid parameters' }, { status: 400 })
  }
  const rollId = Number(rawRollId)

  const ownership = await verifyRollOwner(rollId, session.address)
  if (!ownership.ok) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const r2 = getR2Config()
  if (!r2) {
    return NextResponse.json({ ok: false, error: 'R2 not configured' }, { status: 503 })
  }

  const key = await fetchSyncedShotKey(rollId, photoHash)
  if (!key) {
    return NextResponse.json({ ok: false, error: 'Frame not synced' }, { status: 404 })
  }

  const signedGetUrl = signR2PresignedUrl({
    config: r2,
    method: 'GET',
    bucket: r2.privateBucket,
    key,
    expiresInSec: 60,
  })

  try {
    const upstream = await fetch(signedGetUrl)
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ ok: false, error: 'Upstream frame not found' }, { status: 404 })
    }

    const contentType = upstream.headers.get('content-type') || 'image/webp'
    const buf = await upstream.arrayBuffer()
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'Failed to stream frame' }, { status: 502 })
  }
}
