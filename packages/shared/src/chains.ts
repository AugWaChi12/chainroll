/**
 * KUB Chain network config.
 * ⚠️ Verify chain ids / RPC against official docs (docs.kubchain.com) before deploying — see PROJECT_BRIEF §5.1.
 */
export const kubMainnet = {
  id: 96,
  name: 'KUB Chain',
  nativeCurrency: { name: 'KUB', symbol: 'KUB', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.bitkubchain.io'] } },
  blockExplorers: { default: { name: 'bkcscan', url: 'https://www.bkcscan.com' } },
} as const

export const kubTestnet = {
  id: 25925,
  name: 'KUB Testnet',
  nativeCurrency: { name: 'tKUB', symbol: 'tKUB', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc-testnet.bitkubchain.io'] } },
  blockExplorers: { default: { name: 'bkcscan testnet', url: 'https://testnet.bkcscan.com' } },
  testnet: true,
} as const

export type KubChain = typeof kubMainnet | typeof kubTestnet

export const txUrl = (chain: KubChain, hash: string) =>
  `${chain.blockExplorers.default.url}/tx/${hash}`
