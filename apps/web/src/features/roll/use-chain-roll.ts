'use client'

import { chainRollAbi } from '@chainroll/contracts'
import { activeChain, chainRollContract } from '@/features/wallet'
import type { Address } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { useOnPageRolls } from './onpage-roll-store'

export type ChainRoll = {
  id: bigint
  filmId: number
  frames: number
  framesUsed: number
  /** unix seconds, 0 = not sent for developing */
  developReadyAt: number
}

/** Reads the user's latest roll + daily-claim status from ChainRoll + On-Page confirmed store. */
export function useChainRoll(address: Address | null) {
  const enabled = Boolean(address && chainRollContract)
  const base = { address: chainRollContract!, abi: chainRollAbi, chainId: activeChain.id } as const
  const onPageRolls = useOnPageRolls()

  const myOnPageRoll = address
    ? onPageRolls
        .filter((r) => r.owner.toLowerCase() === address.toLowerCase())
        .sort((a, b) => b.id - a.id)[0] ?? null
    : null

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
  const wagmiRoll: ChainRoll | null =
    rollId && rollId > 0n && r
      ? {
          id: rollId,
          filmId: r.filmId,
          frames: r.frames,
          framesUsed: r.framesUsed,
          developReadyAt: Number(r.developReadyAt),
        }
      : null

  const onPageChainRoll: ChainRoll | null = myOnPageRoll
    ? {
        id: BigInt(myOnPageRoll.id),
        filmId: myOnPageRoll.filmId,
        frames: myOnPageRoll.frames,
        framesUsed: myOnPageRoll.framesUsed,
        developReadyAt: myOnPageRoll.developReadyAt,
      }
    : null

  // Prefer on-page confirmed roll when available or newer
  const roll: ChainRoll | null =
    onPageChainRoll && (!wagmiRoll || onPageChainRoll.id >= wagmiRoll.id)
      ? onPageChainRoll
      : wagmiRoll

  // If the user has no active roll yet, allow claiming immediately
  const canClaim = !roll ? true : (status.data?.[1] ?? false)

  return {
    loading:
      !onPageChainRoll &&
      enabled &&
      (status.isLoading || (rollId !== undefined && rollId > 0n && rollQuery.isLoading)),
    error: onPageChainRoll ? null : (status.error ?? rollQuery.error),
    roll,
    canClaim,
    nextClaimAt: Number(status.data?.[2] ?? 0n),
    refetch: async () => {
      await status.refetch()
      await rollQuery.refetch()
    },
  }
}
