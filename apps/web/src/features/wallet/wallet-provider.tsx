'use client'

import type { BitkubChainSDK } from '@bitkub-chain/sdk.js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Address } from 'viem'
import { WagmiProvider, useAccount, useConnect, useDisconnect } from 'wagmi'
import { bitkubNextEnabled } from '@/lib/env'
import type { WalletAdapter, WalletKind } from './adapter'
import { createBitkubNextAdapter, getBitkubSdk } from './bitkub-next'
import { activeChain, chainRollContract, localChain } from './chain'
import { wagmiConfig } from './config'
import { createInjectedAdapter } from './injected-adapter'

type WalletContextValue = {
  /** null = not connected (or contract not deployed on this chain) */
  adapter: WalletAdapter | null
  address: Address | null
  kind: WalletKind | null
  connecting: boolean
  /** which options the connect sheet should offer */
  available: { bitkubNext: boolean; injected: boolean; dev: boolean }
  connect: (kind: WalletKind) => Promise<void>
  disconnect: () => Promise<void>
  contractReady: boolean
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}

function WalletState({ children }: { children: ReactNode }) {
  const account = useAccount()
  const { connectAsync, connectors } = useConnect()
  const { disconnectAsync } = useDisconnect()
  const [next, setNext] = useState<{ sdk: BitkubChainSDK; address: Address } | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [hasInjected, setHasInjected] = useState(false)

  // detect a browser wallet after mount (window.ethereum)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a browser global once
    setHasInjected(typeof window !== 'undefined' && 'ethereum' in window)
  }, [])

  // restore a Bitkub NEXT session
  useEffect(() => {
    if (!bitkubNextEnabled || activeChain.id === localChain.id) return
    let alive = true
    void getBitkubSdk()
      .then(async (sdk) => {
        if ((await sdk.loginStatus()) !== 'CONNECTED') return
        const address = (await sdk.getUserWalletAddress()) as Address
        if (alive) setNext({ sdk, address })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const connect = useCallback(
    async (kind: WalletKind) => {
      setConnecting(true)
      try {
        if (kind === 'bitkub-next') {
          const sdk = await getBitkubSdk()
          await sdk.loginWithBitkubNext()
          const address = (await sdk.getUserWalletAddress()) as Address
          setNext({ sdk, address })
          return
        }
        const connector = connectors.find((c) =>
          kind === 'dev' ? c.id === 'mock' : c.id === 'injected',
        )
        if (!connector) throw new Error(`connector ${kind} not available`)
        await connectAsync({ connector, chainId: activeChain.id })
      } finally {
        setConnecting(false)
      }
    },
    [connectAsync, connectors],
  )

  const disconnect = useCallback(async () => {
    if (next) {
      await next.sdk.logout().catch(() => {})
      setNext(null)
    }
    if (account.isConnected) await disconnectAsync()
  }, [account.isConnected, disconnectAsync, next])

  const value = useMemo<WalletContextValue>(() => {
    const contract = chainRollContract
    let adapter: WalletAdapter | null = null
    if (contract && next) adapter = createBitkubNextAdapter(next.sdk, next.address, contract)
    else if (contract && account.address && account.connector) {
      adapter = createInjectedAdapter(
        account.address,
        contract,
        account.connector.id === 'mock' ? 'dev' : 'injected',
      )
    }
    return {
      adapter,
      address: next?.address ?? account.address ?? null,
      kind: next
        ? 'bitkub-next'
        : account.connector
          ? account.connector.id === 'mock'
            ? 'dev'
            : 'injected'
          : null,
      connecting: connecting || account.isConnecting,
      available: {
        bitkubNext: bitkubNextEnabled && activeChain.id !== localChain.id,
        injected: hasInjected,
        dev: activeChain.id === localChain.id,
      },
      connect,
      disconnect,
      contractReady: Boolean(contract),
    }
  }, [
    account.address,
    account.connector,
    account.isConnecting,
    connect,
    connecting,
    disconnect,
    hasInjected,
    next,
  ])

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: 1 } } }),
  )
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletState>{children}</WalletState>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
