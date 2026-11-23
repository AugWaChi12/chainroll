import {
  cookieOptions,
  createSessionToken,
  NONCE_COOKIE,
  SESSION_COOKIE,
  verifyNonceToken,
  verifySiweSignature,
} from '@/server/auth/session'
import { checkRateLimit, clientIpFromRequest } from '@/server/security/rate-limit'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const verifySchema = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  chainId: z.number().int().positive(),
  nonce: z.string().min(16).max(64),
  message: z.string().min(20).max(1200),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130,}$/),
})

export async function POST(req: Request) {
  const ip = clientIpFromRequest(req)
  const rl = checkRateLimit(`auth:verify:${ip}`, 15, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { ok: false, error: 'Too many authentication attempts' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = verifySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid SIWE payload' }, { status: 400 })
  }

  const { address, chainId, nonce, message, signature } = parsed.data
  const store = await cookies()
  const nonceCookie = store.get(NONCE_COOKIE)?.value

  if (!verifyNonceToken(nonceCookie, nonce)) {
    return NextResponse.json({ ok: false, error: 'Expired or invalid nonce' }, { status: 401 })
  }

  const valid = await verifySiweSignature({
    address,
    message,
    signature: signature as `0x${string}`,
    expectedNonce: nonce,
  })
  if (!valid) {
    return NextResponse.json({ ok: false, error: 'Invalid wallet signature' }, { status: 401 })
  }

  const sessionToken = createSessionToken(address, chainId)
  const res = NextResponse.json({
    ok: true,
    authenticated: true,
    address: address.toLowerCase(),
    chainId,
  })
  res.cookies.set(SESSION_COOKIE, sessionToken, cookieOptions(60 * 60 * 24 * 7))
  // One-time nonce: clear immediately to prevent replay
  res.cookies.set(NONCE_COOKIE, '', cookieOptions(0))
  return res
}
