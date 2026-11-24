'use client'

import { chainRollAbi } from '@chainroll/contracts'
import { activeChain, chainRollContract } from '@/features/wallet'
import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { useOnPageRolls } from './onpage-roll-store'
import { photoStore } from './photo-store'
import type { ChainRoll } from './use-chain-roll'

/**
 * All rolls we can find for `address`: on-page confirmed rolls (PostgreSQL + local store),
 * the latest one on-chain, and any roll shot on this device.
 */
export function useMyRolls(address: Address | null) {
  const base = { address: chainRollContract!, abi: chainRollAbi, chainId: activeChain.id } as const
  const enabled = Boolean(address && chainRollContract)
  const onPageRolls = useOnPageRolls()

  const latest = useReadContract({
    ...base,
    functionName: 'latestRollOf',
    args: [address!],
    query: { enabled, staleTime: 0 },
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
    query: { enabled: enabled && ids.length > 0, staleTime: 0 },
  })

  const byId = new Map<string, ChainRoll>()

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
    byId.set(String(id), {
      id,
      filmId: r.filmId,
      frames: r.frames,
      framesUsed: r.framesUsed,
      developReadyAt: Number(r.developReadyAt),
    })
  })

  if (address) {
    for (const r of onPageRolls) {
      if (r.owner.toLowerCase() !== address.toLowerCase()) continue
      byId.set(String(r.id), {
        id: BigInt(r.id),
        filmId: r.filmId,
        frames: r.frames,
        framesUsed: r.framesUsed,
        developReadyAt: r.developReadyAt,
      })
    }
  }

  const list = [...byId.values()].sort((a, b) => (b.id > a.id ? 1 : -1))

  return {
    rolls: list,
    loading: list.length === 0 && enabled && (latest.isLoading || rolls.isLoading),
    error: list.length > 0 ? null : (latest.error ?? rolls.error),
    refetch: async () => {
      await latest.refetch()
      await rolls.refetch()
    },
  }
}

/** One roll by id (for /darkroom/[roll]). */
export function useRoll(rollId: bigint | null) {
  const onPageRolls = useOnPageRolls()
  const onPageMatch =
    rollId !== null ? onPageRolls.find((r) => BigInt(r.id) === rollId) ?? null : null

  const q = useReadContract({
    address: chainRollContract!,
    abi: chainRollAbi,
    chainId: activeChain.id,
    functionName: 'getRoll',
    args: [rollId ?? 0n],
    query: {
      enabled: Boolean(chainRollContract && rollId && rollId > 0n),
      refetchInterval: 15_000,
      staleTime: 0,
    },
  })
  const r = q.data
  const wagmiRoll =
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

  // Prefer live on-chain state when contract is configured so developReadyAt / framesUsed never lag behind Postgres cache
  const roll = chainRollContract && wagmiRoll
    ? wagmiRoll
    : onPageMatch
      ? {
          id: BigInt(onPageMatch.id),
          owner: onPageMatch.owner as Address,
          filmId: onPageMatch.filmId,
          frames: onPageMatch.frames,
          framesUsed: onPageMatch.framesUsed,
          developReadyAt: onPageMatch.developReadyAt,
        }
      : wagmiRoll

  return {
    roll,
    loading: !onPageMatch && q.isLoading,
    error: onPageMatch ? null : q.error,
    refetch: q.refetch,
  }
}
