import { z } from 'zod'

const ethAddress = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Invalid EVM address')
  .transform((s) => s.toLowerCase())

const hexHash = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'Invalid 32-byte hash')
  .transform((s) => s.toLowerCase())

const optionalHexHash = hexHash.optional()

/**
 * Prevents SSRF by only allowing remote HTTPS image URLs that belong to our configured
 * Cloudflare R2 public bucket (or *.r2.dev public bucket host).
 */
export function isAllowedRemoteImageUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:') return false
    const configuredBase = process.env.R2_PUBLIC_BASE_URL?.trim()?.replace(/\/+$/, '')
    if (configuredBase && rawUrl.startsWith(`${configuredBase}/`)) {
      return true
    }
    // Allow official Cloudflare R2 public bucket domains (pub-<hash>.r2.dev)
    if (/^pub-[a-f0-9]{32}\.r2\.dev$/i.test(parsed.hostname)) {
      return true
    }
    return false
  } catch {
    return false
  }
}

const safeImageDataUrl = z
  .string()
  .max(600_000, 'Image payload exceeds 600KB limit')
  .refine(
    (s) =>
      s.startsWith('data:image/webp;base64,') ||
      s.startsWith('data:image/jpeg;base64,') ||
      s.startsWith('data:image/png;base64,') ||
      isAllowedRemoteImageUrl(s),
    'Only WebP/JPEG/PNG data URLs or ChainRoll R2 HTTPS URLs are allowed',
  )
  .optional()

const offerSchema = z.object({
  id: z.string().min(1).max(80),
  bidder: ethAddress,
  bidderHandle: z.string().max(32).nullable(),
  amountKub: z.number().finite().positive().max(1_000_000),
  createdAt: z.number().finite().positive(),
  expiresAt: z.number().finite().positive(),
  txHash: hexHash,
})

const historyEventSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum([
    'minted',
    'listed',
    'offer_made',
    'offer_cancelled',
    'offer_accepted',
    'bought',
  ]),
  actor: ethAddress,
  actorHandle: z.string().max(32).nullable(),
  amountKub: z.number().finite().nonnegative().max(1_000_000).optional(),
  txHash: hexHash,
  timestamp: z.number().finite().positive(),
})

const printDtoSchema = z.object({
  tokenId: z.number().int().positive(),
  postId: z.string().min(1).max(80),
  photoHash: hexHash,
  rollId: z.number().int().positive(),
  frame: z.number().int().min(1).max(72),
  filmId: z.number().int().min(1).max(100),
  photographer: ethAddress,
  owner: ethAddress,
  ownerHandle: z.string().max(32).nullable(),
  askPriceKub: z.number().finite().positive().max(1_000_000).nullable(),
  royaltyBps: z.number().int().min(0).max(1000),
  protocolFeeBps: z.number().int().min(0).max(1000),
  mintedAt: z.number().finite().positive(),
  mintTxHash: hexHash,
  lastSaleKub: z.number().finite().positive().max(1_000_000).nullable(),
  offers: z.array(offerSchema).max(50),
  history: z.array(historyEventSchema).max(200),
})

export const dbMutationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('post.create'),
    post: z.object({
      id: z.string().min(1).max(80),
      shooter: ethAddress,
      rollId: z.number().int().positive(),
      frame: z.number().int().min(1).max(72),
      filmId: z.number().int().min(1).max(100),
      photoHash: hexHash,
      watermarkHash: optionalHexHash,
      txHash: optionalHexHash,
      caption: z.string().max(500),
      imageDataUrl: safeImageDataUrl,
      scene: z.enum(['nature', 'portrait', 'night', 'indoor']).optional(),
    }),
  }),
  z.object({
    type: z.literal('post.like'),
    postId: z.string().min(1).max(80),
    userAddress: ethAddress,
  }),
  z.object({
    type: z.literal('post.delete'),
    postId: z.string().min(1).max(80),
    actorAddress: ethAddress,
  }),
  z.object({
    type: z.literal('post.report'),
    postId: z.string().min(1).max(80),
    reporter: ethAddress,
    reason: z.enum(['nsfw', 'spam', 'copyright', 'harassment']),
    note: z.string().max(300).optional(),
  }),
  z.object({
    type: z.literal('profile.save'),
    address: ethAddress,
    handle: z
      .string()
      .regex(/^[a-z0-9._-]{2,24}$/)
      .nullable(),
    bio: z.string().max(280),
  }),
  z.object({
    type: z.literal('user.touch'),
    address: ethAddress,
  }),
  z.object({
    type: z.literal('print.upsert'),
    print: printDtoSchema,
  }),
  z.object({
    type: z.literal('print.preMintOffer'),
    photoHash: hexHash,
    offer: offerSchema,
  }),
  z.object({
    type: z.literal('print.preMintCancel'),
    photoHash: hexHash,
    offerId: z.string().min(1).max(80),
    bidder: ethAddress,
  }),
  z.object({
    type: z.literal('print.preMintClear'),
    photoHash: hexHash,
  }),
  z.object({
    type: z.literal('audit.record'),
    entry: z.object({
      id: z.string().min(1).max(80),
      actor: ethAddress,
      category: z.enum(['moderation', 'films', 'users', 'gas', 'contract']),
      action: z.string().min(1).max(120),
      target: z.string().min(1).max(160),
      detail: z.string().max(500),
      txHash: optionalHexHash,
    }),
  }),
  z.object({
    type: z.literal('audit.remove'),
    id: z.string().min(1).max(80),
  }),
  z.object({
    type: z.literal('roll.claim'),
    roll: z.object({
      id: z.number().int().positive(),
      owner: ethAddress,
      filmId: z.number().int().min(1).max(100),
      frames: z.number().int().min(1).max(72),
      txHash: hexHash,
    }),
  }),
  z.object({
    type: z.literal('roll.shoot'),
    rollId: z.number().int().positive(),
    frame: z.number().int().min(1).max(72),
    photoHash: hexHash,
    txHash: hexHash,
  }),
  z.object({
    type: z.literal('roll.develop'),
    rollId: z.number().int().positive(),
    frames: z.number().int().min(1).max(72),
    readyAtSec: z.number().int().positive(),
  }),
])

export type ValidatedDbMutation = z.infer<typeof dbMutationSchema>

/** Returns the actor address claimed by a mutation payload (null if derived from DB ownership). */
export function claimedActorOf(m: ValidatedDbMutation): string | null {
  switch (m.type) {
    case 'post.create':
      return m.post.shooter
    case 'post.like':
      return m.userAddress
    case 'post.delete':
      return m.actorAddress
    case 'post.report':
      return m.reporter
    case 'profile.save':
    case 'user.touch':
      return m.address
    case 'print.preMintOffer':
      return m.offer.bidder
    case 'print.preMintCancel':
      return m.bidder
    case 'audit.record':
      return m.entry.actor
    case 'roll.claim':
      return m.roll.owner
    default:
      return null
  }
}
