import { fetchVerificationByHashFromDb } from '@/server/db'
import { checkRateLimit, clientIpFromRequest } from '@/server/security/rate-limit'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const hashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid keccak256 photo hash')

export async function GET(req: Request) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`verify:get:${ip}`, 90, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { searchParams } = new URL(req.url)
  const rawHash = (searchParams.get('hash') ?? '').trim()
  const parsed = hashSchema.safeParse(rawHash)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Expected 32-byte 0x-prefixed keccak256 hash' },
      { status: 400 },
    )
  }

  try {
    const record = await fetchVerificationByHashFromDb(parsed.data)
    if (!record) {
      return NextResponse.json({
        ok: true,
        verified: false,
        photoHash: parsed.data.toLowerCase(),
      })
    }
    return NextResponse.json({
      ok: true,
      ...record,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'verification query failed' },
      { status: 503 },
    )
  }
}
