import { z } from 'zod'

/**
 * Public (browser) env, validated once at import. Server-only secrets go in a separate
 * `server/env.ts` that imports 'server-only'.
 * Note: Next inlines NEXT_PUBLIC_* only when accessed literally, so list each one explicitly.
 */
const schema = z.object({
  NEXT_PUBLIC_CHAIN: z.enum(['local', 'testnet', 'mainnet']).default('local'),
  NEXT_PUBLIC_CHAINROLL_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  NEXT_PUBLIC_BITKUB_CLIENT_ID: z.string().optional(),
  NEXT_PUBLIC_BITKUB_SDK_ID: z.string().optional(),
  /** WalletConnect (Reown) project id — free at dashboard.reown.com; enables QR / mobile wallets */
  NEXT_PUBLIC_WC_PROJECT_ID: z.string().optional(),
})

export const env = schema.parse({
  NEXT_PUBLIC_CHAIN: process.env.NEXT_PUBLIC_CHAIN,
  NEXT_PUBLIC_CHAINROLL_ADDRESS: process.env.NEXT_PUBLIC_CHAINROLL_ADDRESS,
  NEXT_PUBLIC_BITKUB_CLIENT_ID: process.env.NEXT_PUBLIC_BITKUB_CLIENT_ID || undefined,
  NEXT_PUBLIC_BITKUB_SDK_ID: process.env.NEXT_PUBLIC_BITKUB_SDK_ID || undefined,
  NEXT_PUBLIC_WC_PROJECT_ID: process.env.NEXT_PUBLIC_WC_PROJECT_ID || undefined,
})

export const bitkubNextEnabled = Boolean(
  env.NEXT_PUBLIC_BITKUB_CLIENT_ID && env.NEXT_PUBLIC_BITKUB_SDK_ID,
)
