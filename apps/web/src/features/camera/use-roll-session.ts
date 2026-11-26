'use client'

import { getStock, type EncodedPhoto } from '@/features/film'
import {
  claimRollOnPage,
  developRollOnPage,
  photoStore,
  shootFrameOnPage,
  syncAllLocalRollsToCloud,
  uploadFrameToPrivateCloud,
  useChainRoll,
  type PhotoRecord,
} from '@/features/roll'
import {
  activeChain,
  classifyTxError,
  getKubBalance,
  txReducer,
  useWallet,
  waitForNextKubBlock,
} from '@/features/wallet'
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { keccak256, stringToHex } from 'viem'
import type { BlockHudTask } from './block-confirm-hud'

export type Shot = PhotoRecord & { url: string }

/**
 * Everything about "the roll in the camera": which roll, its frames, and pushing shots on-chain.
 * A wallet is required — every shot is one tx on KUB Chain. Without one the phase is 'connect'.
 */
export function useRollSession(defaultFrames: number) {
  const wallet = useWallet()
  const chain = useChainRoll(wallet.address)
  const onChain = Boolean(wallet.address)
  const roll = onChain ? chain.roll : null

  const rollKey = roll ? `${activeChain.id}:${roll.id}` : null
  const [shots, setShots] = useState<Shot[]>([])
  const [action, dispatchAction] = useReducer(txReducer, { status: 'idle' })
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null)
  const [hud, setHud] = useState<BlockHudTask | null>(null)
  const [autoConfirm, setAutoConfirm] = useState<boolean>(false)
  const urls = useRef<string[]>([])
  const txInFlightRef = useRef(false)

  // load the roll's photos from IndexedDB whenever the roll changes
  useEffect(() => {
    let alive = true
    const load = async () => {
      const rows = rollKey ? await photoStore.listRoll(rollKey) : []
      if (!alive) return
      urls.current.forEach((u) => URL.revokeObjectURL(u))
      const next = rows.map((r) => ({ ...r, url: URL.createObjectURL(r.blob) }))
      urls.current = next.map((s) => s.url)
      setShots(next)
    }
    void load()
    return () => {
      alive = false
    }
  }, [rollKey])
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  // Background sweep of any unsynced confirmed frames in IndexedDB whenever camera opens or device comes back online
  useEffect(() => {
    if (!wallet.address) return
    const runSweep = () => {
      void syncAllLocalRollsToCloud(activeChain.id)
    }
    runSweep()
    window.addEventListener('online', runSweep)
    return () => window.removeEventListener('online', runSweep)
  }, [wallet.address])

  const patchShot = useCallback((hash: string, patch: Partial<PhotoRecord>) => {
    setShots((prev) => prev.map((s) => (s.hash === hash ? { ...s, ...patch } : s)))
    void photoStore.patch(hash, patch)
  }, [])

  const rollShots = useMemo(
    () => (rollKey ? shots.filter((s) => s.rollKey === rollKey) : []),
    [rollKey, shots],
  )
  const pending = rollShots.filter((s) => s.status === 'pending').length
  const frames = roll?.frames ?? defaultFrames
  // Prefer max of roll.framesUsed and local confirmed+pending shots so counter never double-counts or lags
  const localConfirmed = rollShots.filter((s) => s.status === 'confirmed').length
  const used = Math.max(roll?.framesUsed ?? 0, localConfirmed) + pending
  const full = Boolean(roll && (used >= frames || roll.developReadyAt > 0))

  const phase: 'connect' | 'loading' | 'claim' | 'open' | 'full' = !onChain
    ? 'connect'
    : chain.loading
      ? 'loading'
      : !roll
        ? 'claim'
        : full
          ? 'full'
          : 'open'

  /** Confirm and mine the block in real time synced with KUB Chain RPC blocks (backed by PostgreSQL + local roll store). */
  const executeOnPageConfirm = useCallback(
    async (task: BlockHudTask) => {
      if (!wallet.address) return
      setHud({ ...task, stage: 'mining', errorCode: undefined })
      const { blockNumber } = await waitForNextKubBlock()
      if (task.kind === 'claim') {
        const stock = getStock(task.filmId)
        const { txHash } = claimRollOnPage(wallet.address!, task.filmId, stock.frames)
        setHud({ ...task, stage: 'confirmed', txHash, blockNumber })
      } else if (task.kind === 'shoot' && roll) {
        const { txHash } = shootFrameOnPage(
          roll.id,
          task.digest,
          wallet.address!,
          roll.filmId,
          roll.frames,
        )
        patchShot(task.digest, { status: 'confirmed', txHash, errorCode: undefined })
        setHud({ ...task, stage: 'confirmed', txHash, blockNumber })
      } else if (task.kind === 'develop') {
        const { txHash } = developRollOnPage(task.rollId, Boolean(task.early), 15)
        setHud({ ...task, stage: 'confirmed', txHash, blockNumber })
      }

      window.setTimeout(() => {
        setHud((cur) => (cur?.digest === task.digest && cur.stage === 'confirmed' ? null : cur))
      }, 2400)
    },
    [patchShot, roll, wallet.address],
  )

  /** Push transaction through external wallet extension/app when user clicks "Sign in wallet app". */
  const executeWalletConfirm = useCallback(
    async (task: BlockHudTask) => {
      if (txInFlightRef.current) return
      const adapter = wallet.adapter
      if (!adapter) {
        executeOnPageConfirm(task)
        return
      }
      txInFlightRef.current = true
      setHud({ ...task, stage: 'signing', errorCode: undefined })
      let syncedInBranch = false
      try {
        // Pre-flight real KUB gas check (getKubBalance returns KUB as a number)
        if (wallet.address && wallet.kind !== 'bitkub-next') {
          const bal = await getKubBalance(wallet.address)
          if (bal !== null && bal < 0.0005) {
            if (task.kind === 'shoot') {
              patchShot(task.digest, { status: 'failed', errorCode: 'insufficient-funds' })
            }
            setHud({ ...task, stage: 'failed', errorCode: 'insufficient-funds' })
            return
          }
        }
        if (task.kind === 'claim') {
          const prevRollId = roll?.id ?? 0n
          const txHash = await adapter.claimDailyRoll(task.filmId, {
            onEvent: (e) => {
              if (e.type === 'sign') setHud({ ...task, stage: 'signing' })
              if (e.type === 'approval') setApprovalUrl(e.approvalUrl)
              if (e.type === 'submitted') {
                setApprovalUrl(null)
                setHud({ ...task, stage: 'mining', txHash: e.hash })
              }
            },
          })
          // Wait for the new roll to appear on-chain (or decode RollClaimed from receipt)
          // so the Camera UI switches from Claim → Shutter immediately.
          syncedInBranch = true
          const freshRoll = await chain.refetch({
            waitForNewRollAfter: prevRollId,
            txHash,
          })
          setHud({ ...task, stage: 'confirmed', txHash })
          if (freshRoll && wallet.address && typeof window !== 'undefined') {
            void window
              .fetch('/api/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'roll.claim',
                  roll: {
                    id: Number(freshRoll.id),
                    owner: wallet.address,
                    filmId: freshRoll.filmId,
                    frames: freshRoll.frames,
                    txHash,
                  },
                }),
              })
              .catch(() => {})
          }
        } else if (task.kind === 'shoot' && roll) {
          patchShot(task.digest, { status: 'pending', errorCode: undefined, errorReason: undefined })
          const txHash = await adapter.shoot(roll.id, task.digest, {
            onEvent: (e) => {
              if (e.type === 'sign') setHud({ ...task, stage: 'signing' })
              if (e.type === 'approval') setApprovalUrl(e.approvalUrl)
              if (e.type === 'submitted') {
                setApprovalUrl(null)
                patchShot(task.digest, { txHash: e.hash })
                setHud({ ...task, stage: 'mining', txHash: e.hash })
              }
            },
          })
          patchShot(task.digest, { status: 'confirmed', txHash })
          setHud({ ...task, stage: 'confirmed', txHash })
          syncedInBranch = true
          void chain.refetch({ minFramesUsed: Math.max(roll.framesUsed + 1, task.frame) })
          // Background-sync private frame image to R2 so Phone & PC always see every frame
          // (read from IndexedDB fallback so auto-confirm never misses a shot in a stale closure)
          const capturedRollKey = `${activeChain.id}:${roll.id}`
          const inMemoryBlob = rollShots.find((s) => s.hash === task.digest)?.blob
          void (async () => {
            let blob = inMemoryBlob
            if (!blob || blob.size === 0) {
              const stored = await photoStore.listRoll(capturedRollKey)
              blob = stored.find((s) => s.hash === task.digest)?.blob
            }
            if (!blob || blob.size === 0) return
            const ok = await uploadFrameToPrivateCloud({
              rollId: roll.id,
              frame: task.frame,
              photoHash: task.digest,
              filmId: roll.filmId,
              frames: roll.frames,
              blob,
              txHash,
            })
            if (!ok) {
              await new Promise((r) => setTimeout(r, 1500))
              await uploadFrameToPrivateCloud({
                rollId: roll.id,
                frame: task.frame,
                photoHash: task.digest,
                filmId: roll.filmId,
                frames: roll.frames,
                blob,
                txHash,
              })
            }
          })()
          // Background sync real on-chain shot to Postgres so /verify and /admin stay in sync
          if (wallet.address && typeof window !== 'undefined') {
            const rollIdNum = Number(roll.id)
            void window
              .fetch('/api/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'roll.claim',
                  roll: {
                    id: rollIdNum,
                    owner: wallet.address,
                    filmId: roll.filmId,
                    frames: roll.frames,
                    txHash,
                  },
                }),
              })
              .then(() =>
                window.fetch('/api/state', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    type: 'roll.shoot',
                    rollId: rollIdNum,
                    frame: task.frame,
                    photoHash: task.digest,
                    txHash,
                  }),
                }),
              )
              .catch(() => {})
          }
        } else if (task.kind === 'develop') {
          const fn = task.early ? adapter.developEarly : adapter.develop
          const txHash = await fn(task.rollId, {
            onEvent: (e) => {
              if (e.type === 'sign') setHud({ ...task, stage: 'signing' })
              if (e.type === 'approval') setApprovalUrl(e.approvalUrl)
              if (e.type === 'submitted') {
                setApprovalUrl(null)
                setHud({ ...task, stage: 'mining', txHash: e.hash })
              }
            },
          })
          syncedInBranch = true
          await chain.refetch({ expectDeveloping: true })
          setHud({ ...task, stage: 'confirmed', txHash })
          if (typeof window !== 'undefined') {
            void window
              .fetch('/api/state', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  type: 'roll.develop',
                  rollId: Number(task.rollId),
                  frames: roll?.framesUsed ?? frames,
                  readyAtSec: Math.floor(Date.now() / 1000) + 15,
                }),
              })
              .catch(() => {})
          }
        }

        const dismissMs = task.kind === 'claim' ? 1800 : 2800
        window.setTimeout(() => {
          setHud((cur) => (cur?.digest === task.digest && cur.stage === 'confirmed' ? null : cur))
        }, dismissMs)
      } catch (err) {
        console.error('[ChainRoll tx failed]', task.kind, err)
        const { code, reason } = classifyTxError(err)
        if (task.kind === 'shoot') {
          if (reason === 'HashAlreadyUsed') {
            patchShot(task.digest, { status: 'confirmed' })
            setHud({ ...task, stage: 'confirmed' })
          } else {
            patchShot(task.digest, { status: 'failed', errorCode: code, errorReason: reason })
            setHud({ ...task, stage: 'failed', errorCode: code })
          }
        } else {
          setHud({ ...task, stage: 'failed', errorCode: code })
        }
      } finally {
        txInFlightRef.current = false
        setApprovalUrl(null)
        if (!syncedInBranch) void chain.refetch()
      }
    },
    [chain, executeOnPageConfirm, frames, patchShot, roll, rollShots, wallet.adapter, wallet.address, wallet.kind],
  )

  const addShot = useCallback(
    async (photo: EncodedPhoto, filmId: number) => {
      if (!onChain || !roll || !rollKey || full) return
      const nextFrame = used + 1
      const record: PhotoRecord = {
        ...photo,
        rollKey,
        frame: nextFrame,
        filmId,
        takenAt: Date.now(),
        status: 'pending',
      }
      const url = URL.createObjectURL(photo.blob)
      urls.current.push(url)
      setShots((prev) => [...prev, { ...record, url }])
      await photoStore.put(record)

      const stock = getStock(filmId)
      const task: BlockHudTask = {
        kind: 'shoot',
        frame: nextFrame,
        stockCode: stock.code,
        digest: record.hash,
        stage: 'awaiting-confirm',
      }
      if (autoConfirm) {
        void executeWalletConfirm(task)
      } else {
        setHud(task)
      }
    },
    [autoConfirm, executeWalletConfirm, full, onChain, roll, rollKey, used],
  )

  // Primary confirm button fires a REAL KUB Chain on-chain transaction via wallet.adapter
  const confirmHudShot = useCallback(() => {
    if (hud) void executeWalletConfirm(hud)
  }, [executeWalletConfirm, hud])

  const signHudViaWallet = useCallback(() => {
    if (hud) void executeWalletConfirm(hud)
  }, [executeWalletConfirm, hud])

  const dismissHud = useCallback(() => {
    dispatchAction({ type: 'reset' })
    setHud(null)
  }, [])

  const retry = useCallback(
    (hash: `0x${string}`) => {
      if (!roll) return
      const shot = rollShots.find((s) => s.hash === hash)
      const stock = getStock(roll.filmId)
      const task: BlockHudTask = {
        kind: 'shoot',
        frame: shot?.frame ?? used,
        stockCode: stock.code,
        digest: hash,
        stage: 'awaiting-confirm',
      }
      setHud(task)
    },
    [roll, rollShots, used],
  )

  /** Pop up the On-Page BlockConfirmHud for claiming a daily roll. */
  const claim = useCallback(
    (filmId: number) => {
      if (!wallet.address) return
      dispatchAction({ type: 'reset' })
      const stock = getStock(filmId)
      const digest = keccak256(
        stringToHex(`chainroll:claimDailyRoll:${wallet.address}:${filmId}:${Date.now()}`),
      )
      setHud({
        kind: 'claim',
        filmId,
        stockCode: stock.code,
        digest,
        stage: 'awaiting-confirm',
      })
    },
    [wallet.address],
  )

  /** Pop up the On-Page BlockConfirmHud for sending the active roll to develop. */
  const develop = useCallback(
    (early = false) => {
      if (!roll) return
      dispatchAction({ type: 'reset' })
      const stock = getStock(roll.filmId)
      const digest = keccak256(
        stringToHex(`chainroll:develop:${String(roll.id)}:${early}:${Date.now()}`),
      )
      setHud({
        kind: 'develop',
        rollId: roll.id,
        early,
        stockCode: stock.code,
        digest,
        stage: 'awaiting-confirm',
      })
    },
    [roll],
  )

  return {
    wallet,
    onChain,
    phase,
    roll,
    shots: rollShots,
    used,
    frames,
    full,
    canClaim: chain.canClaim,
    nextClaimAt: chain.nextClaimAt,
    chainError: chain.error,
    action,
    approvalUrl,
    hud,
    autoConfirm,
    setAutoConfirm,
    confirmHudShot,
    signHudViaWallet,
    dismissHud,
    addShot,
    retry,
    claim,
    develop,
  }
}
