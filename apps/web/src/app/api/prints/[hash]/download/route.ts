import { getServerSession } from '@/server/auth/session'
import { getSql } from '@/server/db'
import { checkRateLimit, clientIpFromRequest } from '@/server/security/rate-limit'
import { getR2Config, privateOriginalKey, signR2PresignedUrl } from '@/server/storage/r2'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Issues a 60-second signed GET URL from `chainroll-private` ONLY if the caller's
 * verified SIWE session is the rightful owner (current 1/1 Print owner, or photographer if unminted).
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ hash: string }> },
) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`download:${ip}`, 20, 60_000)
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

  const { hash } = await context.params
  const normHash = hash.toLowerCase()
  if (!/^0x[0-9a-f]{64}$/.test(normHash)) {
    return NextResponse.json({ ok: false, error: 'Invalid photoHash' }, { status: 400 })
  }

  const r2 = getR2Config()
  if (!r2) {
    return NextResponse.json({ ok: false, r2Enabled: false }, { status: 503 })
  }

  const sql = getSql()
  const [printRow] = await sql`
    SELECT owner FROM public.prints WHERE lower(photo_hash) = ${normHash} LIMIT 1
  `
  if (printRow?.owner) {
    if (String(printRow.owner).toLowerCase() !== session.address) {
      return NextResponse.json(
        { ok: false, error: 'Only the current 1/1 Print NFT owner can download the master file' },
        { status: 403 },
      )
    }
  } else {
    const [postRow] = await sql`
      SELECT shooter FROM public.posts WHERE lower(photo_hash) = ${normHash} LIMIT 1
    `
    if (!postRow || String(postRow.shooter).toLowerCase() !== session.address) {
      return NextResponse.json(
        { ok: false, error: 'Only the photographer can download this frame' },
        { status: 403 },
      )
    }
  }

  const signedUrl = signR2PresignedUrl({
    config: r2,
    method: 'GET',
    bucket: r2.privateBucket,
    key: privateOriginalKey(normHash),
    expiresInSec: 60,
  })

  return NextResponse.json({ ok: true, url: signedUrl, expiresInSec: 60 })
}
