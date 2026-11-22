'use client'

import { chainRollAbi } from '@deekub/contracts'
import { activeChain, chainRollContract } from '@/features/wallet'
import type { Address } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'

export type ChainRoll = {
  id: bigint
  filmId: number
  frames: number
  framesUsed: number
  /** unix seconds, 0 = not sent for developing */
  developReadyAt: number
}

/** Reads the user's latest roll + daily-claim status from ChainRoll. */
export function useChainRoll(address: Address | null) {
  const enabled = Boolean(address && chainRollContract)
  const base = { address: chainRollContract!, abi: chainRollAbi, chainId: activeChain.id } as const

  const status = useReadContracts({
    allowFailure: false,
    contracts: [
      { ...base, functionName: 'latestRollOf', args: [address!] },
      { ...base, functionName: 'canClaim', args: [address!] },
      { ...base, functionName: 'nextClaimAt', args: [address!] },
    ],
    query: { enabled },
  })

  const rollId = status.data?.[0]
  const rollQuery = useReadContract({
    ...base,
    functionName: 'getRoll',
    args: [rollId ?? 0n],
    query: { enabled: enabled && rollId !== undefined && rollId > 0n },
  })

  const r = rollQuery.data
  const roll: ChainRoll | null =
    rollId && rollId > 0n && r
      ? {
          id: rollId,
          filmId: r.filmId,
          frames: r.frames,
          framesUsed: r.framesUsed,
          developReadyAt: Number(r.developReadyAt),
        }
      : null

  return {
    loading:
      enabled && (status.isLoading || (rollId !== undefined && rollId > 0n && rollQuery.isLoading)),
    error: status.error ?? rollQuery.error,
    roll,
    canClaim: status.data?.[1] ?? false,
    nextClaimAt: Number(status.data?.[2] ?? 0n),
    refetch: async () => {
      await status.refetch()
      await rollQuery.refetch()
    },
  }
}
