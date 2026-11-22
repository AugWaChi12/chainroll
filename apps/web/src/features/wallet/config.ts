import { createConfig, http } from 'wagmi'
import { injected, mock } from 'wagmi/connectors'
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

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [
    injected({ shimDisconnect: true }),
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
  // one transport per possible chain id keeps the types exact; only activeChain is used
  transports: { 31337: http(), 25925: http(), 96: http() },
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
