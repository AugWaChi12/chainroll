import { getSql } from '@/server/db'
import { checkRateLimit, clientIpFromRequest } from '@/server/security/rate-limit'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/prints/metadata/[tokenId]
 * Standard ERC-721 JSON Metadata endpoint for `ChainRollPrints.tokenURI(tokenId)`.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ tokenId: string }> },
) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`print-meta:${ip}`, 120, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { tokenId: rawId } = await context.params
  if (!/^\d+$/.test(rawId)) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 })
  }
  const tokenId = Number(rawId)

  const sql = getSql()
  const rows = await sql`
    SELECT pr.token_id, pr.post_id, pr.photo_hash, pr.roll_id, pr.frame, pr.film_id,
           pr.photographer, pr.owner, pr.royalty_bps, pr.minted_at,
           p.caption, p.r2_public_url, p.scene, f.name AS film_name
    FROM public.prints pr
    LEFT JOIN public.posts p ON p.id = pr.post_id OR lower(p.photo_hash) = lower(pr.photo_hash)
    LEFT JOIN public.films f ON f.id = pr.film_id
    WHERE pr.token_id = ${tokenId}
    LIMIT 1
  `

  const row = rows[0]
  if (!row) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  }

  const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chainroll.art').replace(/\/$/, '')
  const postId = String(row.post_id)
  const frameNum = Number(row.frame)
  const frameCode = `${String(frameNum).padStart(2, '0')}${frameNum % 2 ? 'A' : ''}`
  const filmName = row.film_name ? String(row.film_name) : `Film #${row.film_id}`
  const imageUrl = row.r2_public_url
    ? String(row.r2_public_url)
    : `${origin}/samples/${String(row.scene ?? 'nature')}.jpg`

  return NextResponse.json(
    {
      name: `ChainRoll 1/1 Print #${String(tokenId).padStart(2, '0')} — Frame ${frameCode}`,
      description:
        String(row.caption ?? '').trim() ||
        `Verified 1/1 Analog 35mm Print shot on ${filmName} (Roll #${row.rollId}, Frame ${frameCode}) on KUB Chain.`,
      image: imageUrl,
      external_url: `${origin}/p/${postId}`,
      attributes: [
        { trait_type: 'Roll', value: `#${row.rollId}` },
        { trait_type: 'Frame', value: frameCode },
        { trait_type: 'Film Stock', value: filmName },
        { trait_type: 'Photographer', value: String(row.photographer).toLowerCase() },
        { trait_type: 'Photo Hash (keccak256)', value: String(row.photo_hash).toLowerCase() },
        { trait_type: 'Royalty', value: `${(Number(row.royalty_bps ?? 500) / 100).toFixed(2)}%` },
      ],
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    },
  )
}
