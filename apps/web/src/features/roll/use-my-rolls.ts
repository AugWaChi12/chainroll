'use client'

import { chainRollAbi } from '@chainroll/contracts'
import { activeChain, chainRollContract } from '@/features/wallet'
import { useEffect, useMemo, useState } from 'react'
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

  // O(1) owner roll index on contracts deployed with getRollsByOwner (gracefully ignored if unavailable)
  const ownerRollIds = useReadContract({
    ...base,
    functionName: 'getRollsByOwner',
    args: [address!],
    query: { enabled, staleTime: 0, retry: false },
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

  const ids = useMemo(() => {
    const latestId = latest.data ?? 0n
    const onChainScan: bigint[] = []
    if (latestId > 0n) {
      // Scan up to the 60 most recent roll IDs on-chain in a single multicall so Phone & PC
      // always see every roll owned by this wallet (not just latestRollOf).
      const start = latestId > 60n ? latestId - 59n : 1n
      for (let id = latestId; id >= start; id--) {
        onChainScan.push(id)
      }
    }
    // P1-4: Also include any historical roll IDs recorded for this owner in Postgres so older rolls
    // are never missed even after >60 global rolls are claimed by other users.
    const dbOwnerIds = address
      ? onPageRolls
          .filter((r) => r.owner.toLowerCase() === address.toLowerCase())
          .map((r) => BigInt(r.id))
      : []

    const directOwnerIds = Array.isArray(ownerRollIds.data) ? [...ownerRollIds.data] : []

    return [
      ...new Set([...directOwnerIds, ...onChainScan, ...localIds, ...dbOwnerIds].map(String)),
    ]
      .map(BigInt)
      .filter((id) => id > 0n)
      .sort((a, b) => (b > a ? 1 : -1))
  }, [address, latest.data, localIds, onPageRolls, ownerRollIds.data])

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

  // Only fall back to off-chain onPageRolls when no live ChainRoll contract is configured.
  // When a live contract is configured, KUB Chain is the single source of truth across all devices.
  if (!chainRollContract && address) {
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
  const rawRoll =
    chainRollContract && wagmiRoll
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

  const rollIdKey = rawRoll ? String(rawRoll.id) : null
  const rollOwner = rawRoll?.owner ?? null
  const rollFilmId = rawRoll?.filmId ?? 0
  const rollFrames = rawRoll?.frames ?? 0
  const rollFramesUsed = rawRoll?.framesUsed ?? 0
  const rollDevelopReadyAt = rawRoll?.developReadyAt ?? 0

  const roll = useMemo(
    () =>
      rollIdKey && rollOwner
        ? {
            id: BigInt(rollIdKey),
            owner: rollOwner,
            filmId: rollFilmId,
            frames: rollFrames,
            framesUsed: rollFramesUsed,
            developReadyAt: rollDevelopReadyAt,
          }
        : null,
    [rollIdKey, rollOwner, rollFilmId, rollFrames, rollFramesUsed, rollDevelopReadyAt],
  )

  return {
    roll,
    loading: !onPageMatch && q.isLoading,
    error: onPageMatch ? null : q.error,
    refetch: q.refetch,
  }
}
