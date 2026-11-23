import { cookieOptions, createNonceToken, NONCE_COOKIE } from '@/server/auth/session'
import { checkRateLimit, clientIpFromRequest } from '@/server/security/rate-limit'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`auth:nonce:${ip}`, 20, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { nonce, token } = createNonceToken()
  const res = NextResponse.json({ ok: true, nonce })
  res.cookies.set(NONCE_COOKIE, token, cookieOptions(60 * 5))
  return res
}
