'use client'

import { chainRollAbi } from '@chainroll/contracts'
import { activeChain, chainRollContract } from '@/features/wallet'
import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { photoStore } from './photo-store'
import type { ChainRoll } from './use-chain-roll'

/**
 * All rolls we can find for `address`: the latest one on-chain + any roll shot on this device.
 * Older rolls shot on other devices appear once the indexer exists (M3b).
 */
export function useMyRolls(address: Address | null) {
  const base = { address: chainRollContract!, abi: chainRollAbi, chainId: activeChain.id } as const
  const enabled = Boolean(address && chainRollContract)

  const latest = useReadContract({
    ...base,
    functionName: 'latestRollOf',
    args: [address!],
    query: { enabled },
  })

  const [localIds, setLocalIds] = useState<bigint[]>([])
  useEffect(() => {
    let alive = true
    void photoStore.rollKeys().then((keys) => {
      const prefix = `${activeChain.id}:`
      const ids = keys
        .filter((k) => k.startsWith(prefix))
        .map((k) => BigInt(k.slice(prefix.length)))
      if (alive) setLocalIds(ids)
    })
    return () => {
      alive = false
    }
  }, [address])

  const ids = [...new Set([...(latest.data ? [latest.data] : []), ...localIds].map(String))]
    .map(BigInt)
    .filter((id) => id > 0n)
    .sort((a, b) => (b > a ? 1 : -1))

  const rolls = useReadContracts({
    allowFailure: true,
    contracts: ids.map((id) => ({
      ...base,
      functionName: 'getRoll' as const,
      args: [id] as const,
    })),
    query: { enabled: enabled && ids.length > 0 },
  })

  const list: ChainRoll[] = []
  ids.forEach((id, i) => {
    const r = rolls.data?.[i]?.result as
      | {
          owner: Address
          filmId: number
          frames: number
          framesUsed: number
          developReadyAt: bigint
        }
      | undefined
    if (!r || !address || r.owner.toLowerCase() !== address.toLowerCase()) return
    list.push({
      id,
      filmId: r.filmId,
      frames: r.frames,
      framesUsed: r.framesUsed,
      developReadyAt: Number(r.developReadyAt),
    })
  })

  return {
    rolls: list,
    loading: enabled && (latest.isLoading || rolls.isLoading),
    error: latest.error ?? rolls.error,
    refetch: async () => {
      await latest.refetch()
      await rolls.refetch()
    },
  }
}

/** One roll by id (for /darkroom/[roll]). */
export function useRoll(rollId: bigint | null) {
  const q = useReadContract({
    address: chainRollContract!,
    abi: chainRollAbi,
    chainId: activeChain.id,
    functionName: 'getRoll',
    args: [rollId ?? 0n],
    query: {
      enabled: Boolean(chainRollContract && rollId && rollId > 0n),
      refetchInterval: 15_000,
    },
  })
  const r = q.data
  const roll =
    r && rollId && r.owner !== '0x0000000000000000000000000000000000000000'
      ? {
          id: rollId,
          owner: r.owner,
          filmId: r.filmId,
          frames: r.frames,
          framesUsed: r.framesUsed,
          developReadyAt: Number(r.developReadyAt),
        }
      : null
  return { roll, loading: q.isLoading, error: q.error, refetch: q.refetch }
}
