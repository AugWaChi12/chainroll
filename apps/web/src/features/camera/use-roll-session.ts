'use client'

import { getStock, type EncodedPhoto } from '@/features/film'
import {
  claimRollOnPage,
  developRollOnPage,
  photoStore,
  shootFrameOnPage,
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
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
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

  const patchShot = useCallback((hash: string, patch: Partial<PhotoRecord>) => {
    setShots((prev) => prev.map((s) => (s.hash === hash ? { ...s, ...patch } : s)))
    void photoStore.patch(hash, patch)
  }, [])

  const pending = shots.filter((s) => s.status === 'pending').length
  const frames = roll?.frames ?? defaultFrames
  // Prefer max of roll.framesUsed and local confirmed+pending shots so counter never double-counts or lags
  const localConfirmed = shots.filter((s) => s.status === 'confirmed').length
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
      const adapter = wallet.adapter
      if (!adapter) {
        executeOnPageConfirm(task)
        return
      }
      setHud({ ...task, stage: 'signing', errorCode: undefined })
      try {
        // Pre-flight real KUB gas check so mobile WalletConnect never hangs silently at 0 KUB
        if (wallet.address && wallet.kind !== 'bitkub-next') {
          const bal = await getKubBalance(wallet.address)
          if (bal !== null && bal < 500_000_000_000_000n) {
            if (task.kind === 'shoot') {
              patchShot(task.digest, { status: 'failed', errorCode: 'insufficient-funds' })
            }
            setHud({ ...task, stage: 'failed', errorCode: 'insufficient-funds' })
            return
          }
        }
        if (task.kind === 'claim') {
          let txHash: `0x${string}` | undefined
          await adapter.claimDailyRoll(task.filmId, {
            onEvent: (e) => {
              if (e.type === 'sign') setHud({ ...task, stage: 'signing' })
              if (e.type === 'approval') setApprovalUrl(e.approvalUrl)
              if (e.type === 'submitted') {
                txHash = e.hash
                setApprovalUrl(null)
                setHud({ ...task, stage: 'mining', txHash: e.hash })
              }
            },
          })
          setHud({ ...task, stage: 'confirmed', txHash })
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
        } else if (task.kind === 'develop') {
          let txHash: `0x${string}` | undefined
          const fn = task.early ? adapter.developEarly : adapter.develop
          await fn(task.rollId, {
            onEvent: (e) => {
              if (e.type === 'sign') setHud({ ...task, stage: 'signing' })
              if (e.type === 'approval') setApprovalUrl(e.approvalUrl)
              if (e.type === 'submitted') {
                txHash = e.hash
                setApprovalUrl(null)
                setHud({ ...task, stage: 'mining', txHash: e.hash })
              }
            },
          })
          setHud({ ...task, stage: 'confirmed', txHash })
        }

        window.setTimeout(() => {
          setHud((cur) => (cur?.digest === task.digest && cur.stage === 'confirmed' ? null : cur))
        }, 3200)
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
        setApprovalUrl(null)
        void chain.refetch()
      }
    },
    [chain, executeOnPageConfirm, patchShot, roll, wallet.adapter, wallet.address, wallet.kind],
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
      const shot = shots.find((s) => s.hash === hash)
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
    [roll, shots, used],
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
    shots,
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
