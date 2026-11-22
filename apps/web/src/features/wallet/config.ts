import { env } from '@/lib/env'
import { createConfig, fallback, http, type Transport } from 'wagmi'
import { injected, mock, walletConnect } from 'wagmi/connectors'
import { activeChain, localChain } from './chain'

/** anvil account #1 — a PUBLIC test account, only ever used against the local chain. */
export const DEV_ACCOUNT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const

const isLocal = activeChain.id === localChain.id

/** Restore the dev wallet after a reload only if it was the last wallet used (not on first visit). */
function devWalletWasUsed() {
  try {
    return (
      typeof window !== 'undefined' && localStorage.getItem('wagmi.recentConnectorId') === '"mock"'
    )
  } catch {
    return false
  }
}

export const walletConnectEnabled = Boolean(env.NEXT_PUBLIC_WC_PROJECT_ID) && !isLocal

/** Every listed RPC, tried in order (KUB has old + new domains — see packages/shared/chains). */
const rpc: Transport = fallback(activeChain.rpcUrls.default.http.map((url) => http(url)))

export const wagmiConfig = createConfig({
  chains: [activeChain],
  // EIP-6963: MetaMask, OKX, Rabby, Coinbase… announce themselves and get their own connector
  multiInjectedProviderDiscovery: true,
  connectors: [
    // generic window.ethereum — only shown when no EIP-6963 wallet announced itself
    injected({ shimDisconnect: true }),
    ...(walletConnectEnabled
      ? [
          walletConnect({
            projectId: env.NEXT_PUBLIC_WC_PROJECT_ID!,
            // we draw our own QR in the connect sheet (PROJECT_BRIEF §9: no stock UI)
            showQrModal: false,
            metadata: {
              name: 'ChainRoll',
              description: 'กล้องฟิล์มบน KUB Chain',
              url: typeof window !== 'undefined' ? window.location.origin : 'https://chainroll.app',
              icons: [],
            },
          }),
        ]
      : []),
    // dev wallet: anvil accounts are unlocked, so the RPC signs for us — local chain only
    ...(isLocal
      ? [
          mock({
            accounts: [DEV_ACCOUNT],
            // without defaultConnected the mock can't restore itself after a reload
            features: { reconnect: true, defaultConnected: devWalletWasUsed() },
          }),
        ]
      : []),
  ],
  // one entry per possible chain id keeps the types exact; only activeChain is used
  transports: { 31337: rpc, 25925: rpc, 96: rpc },
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
