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
import {
  WagmiProvider,
  useAccount,
  useConnect,
  useConnectors,
  useDisconnect,
  useSwitchChain,
  type Connector,
} from 'wagmi'
import { bitkubNextEnabled } from '@/lib/env'
import type { WalletAdapter, WalletKind } from './adapter'
import { createBitkubNextAdapter, getBitkubSdk } from './bitkub-next'
import { activeChain, chainRollContract, localChain } from './chain'
import { wagmiConfig, walletConnectEnabled } from './config'
import { createInjectedAdapter } from './injected-adapter'

/** One row in the connect sheet. */
export type WalletOption = {
  /** connector id, or 'bitkub-next' */
  id: string
  kind: WalletKind
  name: string
  /** data: URI icon announced by the wallet (EIP-6963) */
  icon?: string
  available: boolean
}

type WalletContextValue = {
  /** null = not connected (or contract not deployed on this chain) */
  adapter: WalletAdapter | null
  address: Address | null
  kind: WalletKind | null
  /** display name of the connected wallet, e.g. "MetaMask" */
  walletName: string | null
  connecting: boolean
  options: WalletOption[]
  connect: (optionId: string) => Promise<void>
  disconnect: () => Promise<void>
  /** WalletConnect pairing URI while waiting for a scan (render as QR) */
  wcUri: string | null
  contractReady: boolean
}

const WalletContext = createContext<WalletContextValue | null>(null)

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}

const kindOf = (c: Connector): WalletKind =>
  c.id === 'mock' ? 'dev' : c.type === 'walletConnect' ? 'walletconnect' : 'injected'

function WalletState({ children }: { children: ReactNode }) {
  const account = useAccount()
  const connectors = useConnectors()
  const { connectAsync } = useConnect()
  const { disconnectAsync } = useDisconnect()
  const { switchChainAsync } = useSwitchChain()
  const [next, setNext] = useState<{ sdk: BitkubChainSDK; address: Address } | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [wcUri, setWcUri] = useState<string | null>(null)
  const [hasWindowEthereum, setHasWindowEthereum] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading a browser global once
    setHasWindowEthereum(typeof window !== 'undefined' && 'ethereum' in window)
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

  const options = useMemo<WalletOption[]>(() => {
    const announced = connectors.filter((c) => c.type === 'injected' && c.id !== 'injected')
    const generic = connectors.find((c) => c.id === 'injected')
    const wc = connectors.find((c) => c.type === 'walletConnect')
    const dev = connectors.find((c) => c.id === 'mock')
    const list: WalletOption[] = [
      {
        id: 'bitkub-next',
        kind: 'bitkub-next',
        name: 'Bitkub NEXT',
        available: bitkubNextEnabled && activeChain.id !== localChain.id,
      },
      // EIP-6963 wallets (MetaMask, OKX, Rabby…) with their real names and icons
      ...announced.map((c) => ({
        id: c.id,
        kind: 'injected' as const,
        name: c.name,
        icon: c.icon,
        available: true,
      })),
    ]
    // old-style wallets that don't announce via EIP-6963
    if (announced.length === 0 && generic) {
      list.push({
        id: generic.id,
        kind: 'injected',
        name: 'Browser wallet',
        available: hasWindowEthereum,
      })
    }
    list.push({
      id: wc?.id ?? 'walletConnect',
      kind: 'walletconnect',
      name: 'WalletConnect',
      available: Boolean(wc) && walletConnectEnabled,
    })
    if (dev) list.push({ id: dev.id, kind: 'dev', name: 'Dev wallet', available: true })
    return list
  }, [connectors, hasWindowEthereum])

  const connect = useCallback(
    async (optionId: string) => {
      setConnecting(true)
      setWcUri(null)
      const connector = connectors.find((c) => c.id === optionId)
      const onMessage = ({ type, data }: { type: string; data?: unknown }) => {
        if (type === 'display_uri' && typeof data === 'string') setWcUri(data)
      }
      try {
        if (optionId === 'bitkub-next') {
          const sdk = await getBitkubSdk()
          await sdk.loginWithBitkubNext()
          const address = (await sdk.getUserWalletAddress()) as Address
          setNext({ sdk, address })
          return
        }
        if (!connector) throw new Error(`connector ${optionId} not available`)
        connector.emitter.on('message', onMessage)
        // chainId → injected wallets are asked to add/switch to KUB Chain
        await connectAsync({ connector, chainId: activeChain.id })
      } finally {
        connector?.emitter.off('message', onMessage)
        setWcUri(null)
        setConnecting(false)
      }
    },
    [connectAsync, connectors],
  )

  const activeAddress = next?.address ?? account.address ?? null

  // Auto-detect wallet connection / account switch:
  // 1) Patch user record in DB (`user.touch`)
  // 2) Broadcast `chainroll:wallet-connected` so rolls, posts, prints & offers re-sync from /api/state
  // 3) Auto-switch injected wallets to active KUB Chain if on another network
  useEffect(() => {
    if (!activeAddress || typeof window === 'undefined') return
    void window
      .fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'user.touch', address: activeAddress }),
      })
      .finally(() => {
        window.dispatchEvent(
          new CustomEvent('chainroll:wallet-connected', { detail: { address: activeAddress } }),
        )
      })
      .catch(() => {})
  }, [activeAddress])

  useEffect(() => {
    if (
      account.isConnected &&
      account.connector &&
      kindOf(account.connector) === 'injected' &&
      account.chainId &&
      account.chainId !== activeChain.id
    ) {
      void switchChainAsync({ chainId: activeChain.id }).catch(() => {})
    }
  }, [account.chainId, account.connector, account.isConnected, switchChainAsync])

  const disconnect = useCallback(async () => {
    if (next) {
      await next.sdk.logout().catch(() => {})
      setNext(null)
    }
    if (account.isConnected) {
      await Promise.race([
        disconnectAsync({ connector: account.connector }).catch(() => {}),
        new Promise((r) => setTimeout(r, 1200)),
      ])
    }
  }, [account.connector, account.isConnected, disconnectAsync, next])

  const value = useMemo<WalletContextValue>(() => {
    const contract = chainRollContract
    const connector = account.connector
    let adapter: WalletAdapter | null = null
    if (contract && next) adapter = createBitkubNextAdapter(next.sdk, next.address, contract)
    else if (contract && account.address && connector) {
      adapter = createInjectedAdapter(account.address, contract, kindOf(connector))
    }
    return {
      adapter,
      address: next?.address ?? account.address ?? null,
      kind: next ? 'bitkub-next' : connector ? kindOf(connector) : null,
      walletName: next
        ? 'Bitkub NEXT'
        : connector
          ? kindOf(connector) === 'dev'
            ? 'Dev wallet'
            : connector.name
          : null,
      connecting: connecting || account.isConnecting,
      options,
      connect,
      disconnect,
      wcUri,
      contractReady: Boolean(contract),
    }
  }, [
    account.address,
    account.connector,
    account.isConnecting,
    connect,
    connecting,
    disconnect,
    next,
    options,
    wcUri,
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
