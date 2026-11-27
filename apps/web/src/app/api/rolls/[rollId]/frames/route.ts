import {
  fetchSyncedShotsForRoll,
  getRollMetaFromDbOrChain,
  saveSyncedShotKey,
  verifyPhotoHashOrigin,
} from '@/server/db'
import { checkRateLimit, clientIpFromRequest } from '@/server/security/rate-limit'
import { getR2Config, privateOriginalKey, signR2PresignedUrl } from '@/server/storage/r2'
import { NextResponse } from 'next/server'
import { keccak256 } from 'viem'

export const dynamic = 'force-dynamic'

const MAX_FRAME_BYTES = 650_000
const HASH_RE = /^0x[0-9a-fA-F]{64}$/
const ALLOWED_MIME = new Set(['image/webp', 'image/jpeg'])

function parseRollId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/**
 * GET /api/rolls/[rollId]/frames
 * Returns cloud-synced frames for this roll immediately (zero SIWE friction).
 */
export async function GET(req: Request, context: { params: Promise<{ rollId: string }> }) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`roll-frames:get:${ip}`, 90, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { rollId: rawRollId } = await context.params
  const rollId = parseRollId(rawRollId)
  if (!rollId) {
    return NextResponse.json({ ok: false, error: 'Invalid roll id' }, { status: 400 })
  }

  try {
    const shots = await fetchSyncedShotsForRoll(rollId)
    return NextResponse.json(
      {
        ok: true,
        frames: shots.map((s) => ({
          frame: s.frame,
          photoHash: s.photoHash,
          txHash: s.txHash,
          createdAt: s.createdAt,
          url: `/api/rolls/${rollId}/frames/${s.photoHash}`,
        })),
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to load frames' },
      { status: 500 },
    )
  }
}

/**
 * POST /api/rolls/[rollId]/frames
 * Zero-SIWE automatic cloud backup to Cloudflare R2 private bucket (`chainroll-private`).
 * Security is enforced cryptographically:
 *   1) keccak256(uploadedBytes) MUST exactly equal `photoHash` (unforgeable proof of original capture)
 *   2) `rollId` MUST exist in Postgres or on-chain ChainRoll.sol (owner derived authoritatively, never trusted from client)
 */
export async function POST(req: Request, context: { params: Promise<{ rollId: string }> }) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`roll-frames:post:${ip}`, 60, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const r2 = getR2Config()
  if (!r2) {
    return NextResponse.json(
      { ok: false, r2Enabled: false, error: 'R2 storage not configured' },
      { status: 503 },
    )
  }

  const { rollId: rawRollId } = await context.params
  const rollId = parseRollId(rawRollId)
  if (!rollId) {
    return NextResponse.json({ ok: false, error: 'Invalid roll id' }, { status: 400 })
  }

  const rollMeta = await getRollMetaFromDbOrChain(rollId)
  if (!rollMeta) {
    return NextResponse.json({ ok: false, error: 'Roll not found' }, { status: 404 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid multipart form data' }, { status: 400 })
  }

  const file = form.get('file')
  const frameNum = Number(form.get('frame'))
  const photoHash = String(form.get('photoHash') ?? '')
    .trim()
    .toLowerCase()
  const txHashRaw = String(form.get('txHash') ?? '').trim()
  const txHash = HASH_RE.test(txHashRaw) ? txHashRaw.toLowerCase() : null

  if (!(file instanceof Blob)) {
    return NextResponse.json({ ok: false, error: 'Missing image file' }, { status: 400 })
  }
  if (!Number.isInteger(frameNum) || frameNum < 1 || frameNum > 48) {
    return NextResponse.json({ ok: false, error: 'Invalid frame number' }, { status: 400 })
  }
  if (!HASH_RE.test(photoHash)) {
    return NextResponse.json({ ok: false, error: 'Invalid photoHash' }, { status: 400 })
  }
  if (file.size === 0 || file.size > MAX_FRAME_BYTES) {
    return NextResponse.json({ ok: false, error: 'File size out of bounds' }, { status: 413 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  // 1) Cryptographic integrity check: uploaded bytes MUST hash to photoHash
  const computedHash = keccak256(bytes).toLowerCase()
  if (computedHash !== photoHash) {
    return NextResponse.json(
      { ok: false, error: 'Image digest does not match photoHash' },
      { status: 400 },
    )
  }

  // 2) P0-1 On-chain origin check: photoHash MUST be recorded for (rollId, frameNum) on ChainRoll.sol (or in DB shots)
  const originCheck = await verifyPhotoHashOrigin({
    photoHash,
    expectedRollId: rollId,
    expectedFrame: frameNum,
  })
  if (!originCheck.ok) {
    return NextResponse.json(
      { ok: false, error: 'photoHash is not recorded for this roll/frame on-chain' },
      { status: 403 },
    )
  }

  const contentType = ALLOWED_MIME.has(file.type) ? file.type : 'image/webp'
  const key = privateOriginalKey(photoHash)
  const putUrl = signR2PresignedUrl({
    config: r2,
    method: 'PUT',
    bucket: r2.privateBucket,
    key,
    expiresInSec: 120,
    contentType,
  })

  try {
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: bytes,
    })
    if (!putRes.ok) {
      return NextResponse.json(
        { ok: false, error: `R2 upload failed (${putRes.status})` },
        { status: 502 },
      )
    }

    await saveSyncedShotKey({
      rollId,
      owner: rollMeta.owner,
      filmId: rollMeta.filmId,
      frames: rollMeta.frames,
      frame: frameNum,
      photoHash,
      txHash,
      r2PrivateKey: key,
    })

    return NextResponse.json({
      ok: true,
      url: `/api/rolls/${rollId}/frames/${photoHash}`,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Frame sync failed' },
      { status: 500 },
    )
  }
}
