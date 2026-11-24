import { describe, expect, it } from 'vitest'
import { claimedActorOf, dbMutationSchema, isAllowedRemoteImageUrl } from './validate'

describe('Enterprise API Security — Zod Mutation Validation', () => {
  const validAddr = '0x7B61E12C720FcD4aa01B572bff203af760c7DDd4'
  const validHash = `0x${'a'.repeat(64)}`

  it('accepts valid post.create and normalizes actor address to lowercase', () => {
    const res = dbMutationSchema.safeParse({
      type: 'post.create',
      post: {
        id: 'p-test-1',
        shooter: validAddr,
        rollId: 12,
        frame: 4,
        filmId: 1,
        photoHash: validHash,
        caption: 'Golden hour at Chao Phraya',
        imageDataUrl: 'data:image/webp;base64,UklGRh4AAABXRUJQ',
      },
    })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(claimedActorOf(res.data)).toBe(validAddr.toLowerCase())
    }
  })

  it('rejects XSS / javascript: URLs in imageDataUrl', () => {
    const res = dbMutationSchema.safeParse({
      type: 'post.create',
      post: {
        id: 'p-xss',
        shooter: validAddr,
        rollId: 1,
        frame: 1,
        filmId: 1,
        photoHash: validHash,
        caption: 'xss attempt',
        imageDataUrl: 'javascript:alert(1)',
      },
    })
    expect(res.success).toBe(false)
  })

  it('rejects oversized imageDataUrl (> 600KB)', () => {
    const res = dbMutationSchema.safeParse({
      type: 'post.create',
      post: {
        id: 'p-huge',
        shooter: validAddr,
        rollId: 1,
        frame: 1,
        filmId: 1,
        photoHash: validHash,
        caption: 'dos attempt',
        imageDataUrl: `data:image/webp;base64,${'A'.repeat(600_100)}`,
      },
    })
    expect(res.success).toBe(false)
  })

  it('rejects negative or zero KUB pre-mint offers', () => {
    const res = dbMutationSchema.safeParse({
      type: 'print.preMintOffer',
      photoHash: validHash,
      offer: {
        id: 'pmo-1',
        bidder: validAddr,
        bidderHandle: 'attacker',
        amountKub: -10,
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600_000,
        txHash: validHash,
      },
    })
    expect(res.success).toBe(false)
  })

  it('rejects invalid EVM addresses', () => {
    const res = dbMutationSchema.safeParse({
      type: 'post.delete',
      postId: 'p-101',
      actorAddress: 'not-an-address',
    })
    expect(res.success).toBe(false)
  })

  it('blocks SSRF external/internal imageDataUrl hosts and allows official R2 bucket URLs', () => {
    expect(isAllowedRemoteImageUrl('http://169.254.169.254/latest/meta-data')).toBe(false)
    expect(isAllowedRemoteImageUrl('https://evil.example.com/photo.jpg')).toBe(false)
    expect(
      isAllowedRemoteImageUrl(
        'https://pub-19aa462bba4944f4b2ac29a9df514213.r2.dev/feed/0x123.webp',
      ),
    ).toBe(true)
  })
})
