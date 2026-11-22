/**
 * KUB Chain network config.
 * Source: KUB Chain Whitepaper V5.2 (chain ids, new kubchain.io RPC domains).
 * Each network lists two RPCs; apps use them as an automatic fallback.
 * Checked 2026-11-22: mainnet rpc.kubchain.io OK; rpc-testnet.kubchain.io not answering yet, so the old testnet domain goes first.
 */
export const kubMainnet = {
  id: 96,
  name: 'KUB Chain',
  nativeCurrency: { name: 'KUB', symbol: 'KUB', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.kubchain.io', 'https://rpc.bitkubchain.io'] } },
  blockExplorers: { default: { name: 'bkcscan', url: 'https://www.bkcscan.com' } },
} as const

export const kubTestnet = {
  id: 25925,
  name: 'KUB Testnet',
  nativeCurrency: { name: 'tKUB', symbol: 'tKUB', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-testnet.bitkubchain.io', 'https://rpc-testnet.kubchain.io'] },
  },
  blockExplorers: { default: { name: 'bkcscan testnet', url: 'https://testnet.bkcscan.com' } },
  testnet: true,
} as const

export type KubChain = typeof kubMainnet | typeof kubTestnet

export const txUrl = (chain: KubChain, hash: string) =>
  `${chain.blockExplorers.default.url}/tx/${hash}`
