import { cookieOptions, NONCE_COOKIE, SESSION_COOKIE } from '@/server/auth/session'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', cookieOptions(0))
  res.cookies.set(NONCE_COOKIE, '', cookieOptions(0))
  return res
}
