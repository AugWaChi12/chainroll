'use client'

import type { BitkubChainSDK } from '@bitkub-chain/sdk.js'
import type { Address, Hex } from 'viem'
import { bitkubNextEnabled, env } from '@/lib/env'
import type { TxHooks, WalletAdapter } from './adapter'
import { activeChain, localChain } from './chain'

/**
 * Bitkub NEXT — custodial wallet via the official NEXT SDK (OAuth login, approval page per tx).
 * Calls reach ChainRoll through `sdkCallHelperRouter`, so every function takes the trailing
 * `address _bitkubNext`, which the SDK fills in (we only pass the leading params).
 */

export const OAUTH_CALLBACK_PATH = '/oauth/callback'

let sdkPromise: Promise<BitkubChainSDK> | null = null

/** Lazily loads the SDK in the browser (it touches window/localStorage on construction). */
export function getBitkubSdk(): Promise<BitkubChainSDK> {
  if (!bitkubNextEnabled) return Promise.reject(new Error('Bitkub NEXT is not configured'))
  sdkPromise ??= import('@bitkub-chain/sdk.js').then(({ initializeSDK, Network }) =>
    initializeSDK(
      env.NEXT_PUBLIC_BITKUB_CLIENT_ID!,
      env.NEXT_PUBLIC_BITKUB_SDK_ID!,
      activeChain.id === 96 ? Network.BKC_MAINNET : Network.BKC_TESTNET,
      { loginRedirectPath: OAUTH_CALLBACK_PATH },
    ),
  )
  return sdkPromise
}

/** Readable ABI strings the SDK encodes — must match ChainRoll's router entry points exactly. */
export const NEXT_SIGNATURES = {
  claimDailyRoll: 'claimDailyRoll(uint16 filmId, address _bitkubNext)',
  shoot: 'shoot(uint256 rollId, bytes32 photoHash, address _bitkubNext)',
  develop: 'develop(uint256 rollId, address _bitkubNext)',
} as const

const POLL_MS = 2000
const TIMEOUT_MS = 5 * 60_000

export function createBitkubNextAdapter(
  sdk: BitkubChainSDK,
  address: Address,
  contract: Address,
): WalletAdapter {
  if (activeChain.id === localChain.id) {
    throw new Error('Bitkub NEXT only works on KUB testnet/mainnet')
  }

  const send = async (hooks: TxHooks, sig: string, params: string[]): Promise<Hex> => {
    hooks.onEvent({ type: 'sign' })
    const res = await sdk.sendCustomTx(contract, sig, params)
    hooks.onEvent({ type: 'approval', approvalUrl: res.approvalURL })
    // the user approves on Bitkub NEXT's own page
    window.open(res.approvalURL, '_blank', 'noopener')

    const started = Date.now()
    for (;;) {
      await new Promise((r) => setTimeout(r, POLL_MS))
      const d = await sdk.getTransactionDetails(res.queueID)
      if (d.status === 'SUCCESS' || d.status === 'MINED') {
        const hash = d.txHash as Hex
        hooks.onEvent({ type: 'mined', hash })
        return hash
      }
      if (d.status === 'FAILED') throw new Error(d.errorMessage || 'Bitkub NEXT transaction failed')
      if (Date.now() - started > TIMEOUT_MS) throw new Error('Bitkub NEXT approval timed out')
    }
  }

  return {
    kind: 'bitkub-next',
    address,
    claimDailyRoll: (filmId, hooks) =>
      send(hooks, NEXT_SIGNATURES.claimDailyRoll, [String(filmId)]),
    shoot: (rollId, photoHash, hooks) =>
      send(hooks, NEXT_SIGNATURES.shoot, [rollId.toString(), photoHash]),
    develop: (rollId, hooks) => send(hooks, NEXT_SIGNATURES.develop, [rollId.toString()]),
  }
}
