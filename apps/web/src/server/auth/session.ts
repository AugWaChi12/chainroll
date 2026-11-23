import 'server-only'

import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { createPublicClient, fallback, http, verifyMessage, type Address } from 'viem'
import { chainRollAbi, chainRollAddress } from '@chainroll/contracts'
import { kubMainnet, kubTestnet } from '@chainroll/shared'

export const SESSION_COOKIE = 'chainroll_session'
export const NONCE_COOKIE = 'chainroll_nonce'
const SESSION_TTL_SEC = 60 * 60 * 24 * 7 // 7 days
const NONCE_TTL_SEC = 60 * 5 // 5 minutes

const DEFAULT_ADMIN_ROLE =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as const
const CURATOR_ROLE =
  '0x850d585eb7f024ccee5e68e55f2c26cc72e1e6ee456acf62135757a5eb9d4a10' as const // keccak256("CURATOR_ROLE")

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
}): Promise<boolean> {
  // Basic SIWE structural checks: address & nonce must appear in the signed message
  if (!input.message.includes(input.expectedNonce)) return false
  if (!input.message.toLowerCase().includes(input.address.toLowerCase())) return false

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

// ── Server-side On-Chain RBAC Verification (cached 60s) ──
const roleCache = new Map<string, { allowed: boolean; exp: number }>()

function activeServerChain() {
  return process.env.NEXT_PUBLIC_CHAIN === 'mainnet' ? kubMainnet : kubTestnet
}

export async function isOnChainAdminOrCurator(address: string): Promise<boolean> {
  const norm = address.toLowerCase()
  const cached = roleCache.get(norm)
  if (cached && cached.exp > Date.now()) return cached.allowed

  const chain = activeServerChain()
  const contractAddr =
    (process.env.NEXT_PUBLIC_CHAINROLL_ADDRESS as Address | undefined) ??
    chainRollAddress[chain.id]
  if (!contractAddr) return false

  try {
    const client = createPublicClient({
      chain,
      transport: fallback(chain.rpcUrls.default.http.map((url: string) => http(url))),
    })
    const [isAdmin, isCurator] = await Promise.all([
      client.readContract({
        address: contractAddr,
        abi: chainRollAbi,
        functionName: 'hasRole',
        args: [DEFAULT_ADMIN_ROLE, norm as Address],
      }),
      client.readContract({
        address: contractAddr,
        abi: chainRollAbi,
        functionName: 'hasRole',
        args: [CURATOR_ROLE, norm as Address],
      }),
    ])
    const allowed = Boolean(isAdmin || isCurator)
    roleCache.set(norm, { allowed, exp: Date.now() + 60_000 })
    return allowed
  } catch {
    return false
  }
}
