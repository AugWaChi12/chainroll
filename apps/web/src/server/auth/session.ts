import 'server-only'

import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { verifyMessage, type Address } from 'viem'

export const SESSION_COOKIE = 'chainroll_session'
export const NONCE_COOKIE = 'chainroll_nonce'
const SESSION_TTL_SEC = 60 * 60 * 24 * 7 // 7 days
const NONCE_TTL_SEC = 60 * 5 // 5 minutes

const globalForSecret = globalThis as unknown as { __chainrollDevSecret?: string }

function getSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
    return process.env.SESSION_SECRET
  }
  if (!globalForSecret.__chainrollDevSecret) {
    // Deterministic fallback only for local dev when SESSION_SECRET isn't set
    globalForSecret.__chainrollDevSecret = crypto
      .createHash('sha256')
      .update(process.env.DATABASE_URL ?? 'chainroll-local-dev-secret')
      .digest('hex')
  }
  return globalForSecret.__chainrollDevSecret
}

function hmacSign(payload: string): string {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}

export type SessionPayload = {
  address: string
  chainId: number
  iat: number
  exp: number
}

export function encodeSignedToken(obj: object): string {
  const payload = Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url')
  const sig = hmacSign(payload)
  return `${payload}.${sig}`
}

export function decodeSignedToken<T>(token: string | undefined): T | null {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = hmacSign(payload)
  if (!safeEqual(sig, expected)) return null
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

export function createNonceToken(): { nonce: string; token: string } {
  const nonce = crypto.randomBytes(16).toString('hex')
  const now = Math.floor(Date.now() / 1000)
  const token = encodeSignedToken({ nonce, exp: now + NONCE_TTL_SEC })
  return { nonce, token }
}

export function verifyNonceToken(token: string | undefined, expectedNonce: string): boolean {
  const parsed = decodeSignedToken<{ nonce: string; exp: number }>(token)
  if (!parsed) return false
  const now = Math.floor(Date.now() / 1000)
  if (parsed.exp < now) return false
  return safeEqual(parsed.nonce, expectedNonce)
}

export function createSessionToken(address: string, chainId: number): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = {
    address: address.toLowerCase(),
    chainId,
    iat: now,
    exp: now + SESSION_TTL_SEC,
  }
  return encodeSignedToken(payload)
}

export async function getServerSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const raw = store.get(SESSION_COOKIE)?.value
  const parsed = decodeSignedToken<SessionPayload>(raw)
  if (!parsed) return null
  const now = Math.floor(Date.now() / 1000)
  if (parsed.exp < now || !/^0x[0-9a-f]{40}$/.test(parsed.address)) return null
  return parsed
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  }
}

export async function verifySiweSignature(input: {
  address: string
  message: string
  signature: `0x${string}`
  expectedNonce: string
  expectedHost?: string | null
  expectedChainId?: number
}): Promise<boolean> {
  // Strict SIWE structural checks: domain/host, chainId, address & nonce must match the signed message
  if (!input.message.includes(`Nonce: ${input.expectedNonce}`)) return false
  if (!input.message.toLowerCase().includes(input.address.toLowerCase())) return false

  if (input.expectedHost) {
    const cleanHost = input.expectedHost.split(',')[0]!.trim().toLowerCase()
    const firstLine = (input.message.split('\n')[0] ?? '').trim().toLowerCase()
    if (cleanHost && !firstLine.startsWith(`${cleanHost} wants you to sign in`)) {
      return false
    }
  }

  if (input.expectedChainId !== undefined) {
    if (!input.message.includes(`Chain ID: ${input.expectedChainId}`)) {
      return false
    }
  }

  try {
    return await verifyMessage({
      address: input.address as Address,
      message: input.message,
      signature: input.signature,
    })
  } catch {
    return false
  }
}

// ── Server-side Strict Admin Allowlist (Owner Wallets Only) ──
const DEFAULT_ADMIN_WALLETS = [
  '0x7b61e12c720fcd4aa01b572bff203af760c7ddd4',
  '0x8a90e75d423174f57f6b9cd947b97b4fbd5ed4e5',
]

function getAdminAllowlist(): Set<string> {
  const fromEnv = (process.env.ADMIN_WALLETS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^0x[0-9a-f]{40}$/.test(s))
  return new Set(fromEnv.length > 0 ? fromEnv : DEFAULT_ADMIN_WALLETS)
}

export async function isOnChainAdminOrCurator(address: string): Promise<boolean> {
  return getAdminAllowlist().has(address.toLowerCase())
}
