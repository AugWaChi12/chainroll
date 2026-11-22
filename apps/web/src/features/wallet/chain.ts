import { chainRollAddress } from '@deekub/contracts'
import { kubMainnet, kubTestnet } from '@deekub/shared'
import { env } from '@/lib/env'
import { defineChain, type Address } from 'viem'

export const localChain = defineChain({
  id: 31337,
  name: 'KUB Local (anvil)',
  nativeCurrency: { name: 'KUB', symbol: 'KUB', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  testnet: true,
})

const CHAINS = {
  local: localChain,
  testnet: defineChain(kubTestnet),
  mainnet: defineChain(kubMainnet),
} as const

/** The one chain this build talks to. */
export const activeChain = CHAINS[env.NEXT_PUBLIC_CHAIN]

/** anvil's first deployment from account #0 is deterministic (see scripts/dev-chain.mjs) */
const LOCAL_ADDRESS: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3'

export const chainRollContract: Address | undefined =
  (env.NEXT_PUBLIC_CHAINROLL_ADDRESS as Address | undefined) ??
  (activeChain.id === localChain.id ? LOCAL_ADDRESS : chainRollAddress[activeChain.id])

export function explorerTxUrl(hash: string): string | undefined {
  const base = activeChain.blockExplorers?.default.url
  return base ? `${base}/tx/${hash}` : undefined
}
