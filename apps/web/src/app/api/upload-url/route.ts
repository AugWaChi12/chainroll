import { getServerSession } from '@/server/auth/session'
import { verifyPhotoHashOrigin } from '@/server/db'
import { checkRateLimit, clientIpFromRequest } from '@/server/security/rate-limit'
import {
  getR2Config,
  privateOriginalKey,
  publicFeedKey,
  publicFeedUrl,
  signR2PresignedUrl,
} from '@/server/storage/r2'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const uploadRequestSchema = z.object({
  photoHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .transform((s) => s.toLowerCase()),
  contentType: z.enum(['image/webp', 'image/jpeg']),
  publicContentType: z.enum(['image/webp', 'image/jpeg']).optional(),
  bytes: z.number().int().positive().max(650_000),
})

/**
 * Issues short-lived (120s) presigned PUT URLs for both:
 * 1) `chainroll-public` (feed preview via CDN)
 * 2) `chainroll-private` (1/1 Print master original for owner-only signed downloads)
 */
export async function POST(req: Request) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`upload:${ip}`, 20, 60_000)
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

  const r2 = getR2Config()
  if (!r2) {
    return NextResponse.json({ ok: false, r2Enabled: false, error: 'R2 not configured' }, { status: 503 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = uploadRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid upload request' }, { status: 400 })
  }

  const { photoHash, contentType, publicContentType } = parsed.data

  // P0-1: Verify that `session.address` is the rightful shooter/owner of `photoHash`
  // before issuing presigned PUT URLs so no user can overwrite another user's R2 objects.
  const originCheck = await verifyPhotoHashOrigin({
    photoHash,
    expectedOwner: session.address,
  })
  if (!originCheck.ok) {
    return NextResponse.json(
      { ok: false, error: 'You do not own this photoHash on-chain' },
      { status: 403 },
    )
  }

  const pubMime = publicContentType ?? contentType
  const publicPutUrl = signR2PresignedUrl({
    config: r2,
    method: 'PUT',
    bucket: r2.publicBucket,
    key: publicFeedKey(photoHash),
    expiresInSec: 120,
    contentType: pubMime,
  })
  const privatePutUrl = signR2PresignedUrl({
    config: r2,
    method: 'PUT',
    bucket: r2.privateBucket,
    key: privateOriginalKey(photoHash),
    expiresInSec: 120,
    contentType,
  })

  return NextResponse.json({
    ok: true,
    r2Enabled: true,
    publicPutUrl,
    privatePutUrl,
    publicUrl: publicFeedUrl(r2, photoHash),
  })
}
