'use client'

import { chainRollAbi } from '@chainroll/contracts'
import { activeChain, chainRollContract, wagmiConfig } from '@/features/wallet'
import { useCallback, useState } from 'react'
import { decodeEventLog, type Address, type Hex } from 'viem'
import { useReadContract, useReadContracts } from 'wagmi'
import { getTransactionReceipt, readContract, readContracts } from 'wagmi/actions'
import { useOnPageRolls } from './onpage-roll-store'

export type ChainRoll = {
  id: bigint
  filmId: number
  frames: number
  framesUsed: number
  /** unix seconds, 0 = not sent for developing */
  developReadyAt: number
}

export type RefetchRollOptions = {
  /** Wait until on-chain latestRollOf(address) advances past this id (e.g. after claimDailyRoll). */
  waitForNewRollAfter?: bigint
  /** Wait until on-chain framesUsed reaches at least this count (e.g. after shoot). */
  minFramesUsed?: number
  /** Wait until on-chain developReadyAt > 0 (e.g. after develop / developEarly). */
  expectDeveloping?: boolean
  /** Optional mined tx hash so RollClaimed log can seed UI immediately if RPC eth_call lags. */
  txHash?: Hex
}

type SyncedSnapshot = {
  address: string
  roll: ChainRoll | null
  canClaim: boolean
  nextClaimAt: number
}

const POLL_ATTEMPTS = 8
const POLL_DELAY_MS = 450

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isSyncedNewer(synced: ChainRoll, wagmi: ChainRoll | null): boolean {
  if (!wagmi) return true
  if (synced.id > wagmi.id) return true
  if (synced.id < wagmi.id) return false
  if (synced.framesUsed > wagmi.framesUsed) return true
  if (synced.developReadyAt > wagmi.developReadyAt) return true
  return false
}

async function decodeClaimedRollFromReceipt(
  txHash: Hex,
  expectedOwner: Address,
): Promise<ChainRoll | null> {
  try {
    const receipt = await getTransactionReceipt(wagmiConfig, {
      hash: txHash,
      chainId: activeChain.id,
    })
    for (const log of receipt.logs) {
      if (chainRollContract && log.address.toLowerCase() !== chainRollContract.toLowerCase()) {
        continue
      }
      try {
        const decoded = decodeEventLog({
          abi: chainRollAbi,
          data: log.data,
          topics: log.topics,
        })
        if (
          decoded.eventName === 'RollClaimed' &&
          decoded.args.owner.toLowerCase() === expectedOwner.toLowerCase()
        ) {
          return {
            id: decoded.args.rollId,
            filmId: Number(decoded.args.filmId),
            frames: Number(decoded.args.frames),
            framesUsed: 0,
            developReadyAt: 0,
          }
        }
      } catch {
        // Ignore non-matching logs
      }
    }
  } catch {
    // Receipt lookup failed; caller will rely on eth_call polling
  }
  return null
}

/** Reads the user's latest roll + daily-claim status from ChainRoll + On-Page confirmed store. */
export function useChainRoll(address: Address | null) {
  const enabled = Boolean(address && chainRollContract)
  const base = { address: chainRollContract!, abi: chainRollAbi, chainId: activeChain.id } as const
  const onPageRolls = useOnPageRolls()
  const [synced, setSynced] = useState<SyncedSnapshot | null>(null)

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
    query: { enabled, staleTime: 0 },
  })

  const rollId = status.data?.[0]
  const rollQuery = useReadContract({
    ...base,
    functionName: 'getRoll',
    args: [rollId ?? 0n],
    query: { enabled: enabled && rollId !== undefined && rollId > 0n, staleTime: 0 },
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

  const activeSynced =
    synced && address && synced.address.toLowerCase() === address.toLowerCase() ? synced : null
  const useSynced = Boolean(activeSynced?.roll && isSyncedNewer(activeSynced.roll, wagmiRoll))

  // When a live ChainRoll contract is configured, ALWAYS use the real on-chain roll
  // (preferring the fresher post-tx synced snapshot while wagmi's query catches up).
  // Never fall back to legacy off-chain/DB rolls (id 101+) which do not exist on ChainRoll.sol
  // and would cause ChainRoll.shoot() to revert on KUB Chain!
  const roll: ChainRoll | null = chainRollContract
    ? useSynced
      ? activeSynced!.roll
      : wagmiRoll
    : onPageChainRoll

  // On-chain canClaim is authoritative when contract read succeeded; allow claiming if no roll exists
  const canClaim = useSynced
    ? activeSynced!.canClaim
    : status.data !== undefined
      ? Boolean(status.data[1])
      : !roll

  const nextClaimAt = useSynced
    ? activeSynced!.nextClaimAt
    : Number(status.data?.[2] ?? 0n)

  const refetch = useCallback(
    async (opts?: RefetchRollOptions): Promise<ChainRoll | null> => {
      if (!address || !chainRollContract) return null

      const contractBase = {
        address: chainRollContract,
        abi: chainRollAbi,
        chainId: activeChain.id,
      } as const

      // Fast path after claimDailyRoll: decode RollClaimed from the mined receipt immediately
      // so UI switches to the Shutter button without waiting on a lagging RPC read node.
      let receiptRoll: ChainRoll | null = null
      if (opts?.txHash && opts.waitForNewRollAfter !== undefined) {
        receiptRoll = await decodeClaimedRollFromReceipt(opts.txHash, address)
        if (receiptRoll && receiptRoll.id > opts.waitForNewRollAfter) {
          setSynced((prev) => ({
            address,
            roll: receiptRoll,
            canClaim: prev?.canClaim ?? false,
            nextClaimAt: prev?.nextClaimAt ?? 0,
          }))
        }
      }

      const maxAttempts =
        opts?.waitForNewRollAfter !== undefined ||
        opts?.minFramesUsed !== undefined ||
        opts?.expectDeveloping
          ? POLL_ATTEMPTS
          : 1

      let latestRoll: ChainRoll | null = receiptRoll

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const [latestId, freshCanClaim, freshNextClaimAt] = await readContracts(wagmiConfig, {
            allowFailure: false,
            contracts: [
              { ...contractBase, functionName: 'latestRollOf', args: [address] },
              { ...contractBase, functionName: 'canClaim', args: [address] },
              { ...contractBase, functionName: 'nextClaimAt', args: [address] },
            ],
          })

          let freshRoll: ChainRoll | null = null
          if (latestId > 0n) {
            const raw = await readContract(wagmiConfig, {
              ...contractBase,
              functionName: 'getRoll',
              args: [latestId],
            })
            if (raw.frames > 0) {
              freshRoll = {
                id: latestId,
                filmId: raw.filmId,
                frames: raw.frames,
                framesUsed: raw.framesUsed,
                developReadyAt: Number(raw.developReadyAt),
              }
            }
          }

          const satisfied =
            (opts?.waitForNewRollAfter === undefined ||
              (freshRoll !== null && freshRoll.id > opts.waitForNewRollAfter)) &&
            (opts?.minFramesUsed === undefined ||
              (freshRoll !== null && freshRoll.framesUsed >= opts.minFramesUsed)) &&
            (!opts?.expectDeveloping || (freshRoll !== null && freshRoll.developReadyAt > 0))

          if (freshRoll && (!latestRoll || isSyncedNewer(freshRoll, latestRoll))) {
            latestRoll = freshRoll
          }

          if (satisfied || attempt === maxAttempts - 1) {
            const resolvedRoll = freshRoll ?? latestRoll
            if (resolvedRoll) {
              setSynced({
                address,
                roll: resolvedRoll,
                canClaim: Boolean(freshCanClaim),
                nextClaimAt: Number(freshNextClaimAt),
              })
            }
            break
          }
        } catch {
          if (attempt === maxAttempts - 1) break
        }
        await sleep(POLL_DELAY_MS)
      }

      // Sync wagmi's own query cache in the background so future renders stay aligned
      void status.refetch().then(() => rollQuery.refetch())

      return latestRoll
    },
    [address, rollQuery, status],
  )

  return {
    loading:
      enabled &&
      !useSynced &&
      (status.isLoading || (rollId !== undefined && rollId > 0n && rollQuery.isLoading)),
    error: useSynced ? null : (status.error ?? rollQuery.error),
    roll,
    canClaim,
    nextClaimAt,
    refetch,
  }
}
