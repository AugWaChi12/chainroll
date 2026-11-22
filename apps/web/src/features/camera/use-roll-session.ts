'use client'

import type { EncodedPhoto } from '@/features/film'
import { photoStore, useChainRoll, type PhotoRecord } from '@/features/roll'
import { activeChain, classifyTxError, txReducer, useWallet, type TxEvent } from '@/features/wallet'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

export type Shot = PhotoRecord & { url: string }

/**
 * Everything about "the roll in the camera": which roll, its frames, and pushing shots on-chain.
 * A wallet is required — every shot is one tx on KUB Chain. Without one the phase is 'connect'.
 */
export function useRollSession(defaultFrames: number) {
  const wallet = useWallet()
  const chain = useChainRoll(wallet.address)
  const onChain = Boolean(wallet.adapter)
  const roll = onChain ? chain.roll : null

  const rollKey = roll ? `${activeChain.id}:${roll.id}` : null
  const [shots, setShots] = useState<Shot[]>([])
  const [action, dispatchAction] = useReducer(txReducer, { status: 'idle' })
  const [approvalUrl, setApprovalUrl] = useState<string | null>(null)
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
  const used = (roll?.framesUsed ?? 0) + pending
  const full = used >= frames

  const phase: 'connect' | 'loading' | 'claim' | 'open' | 'full' = !onChain
    ? 'connect'
    : chain.loading
      ? 'loading'
      : !roll
        ? 'claim'
        : roll.framesUsed >= roll.frames
          ? 'full'
          : 'open'

  /** Push one photo's hash on-chain (also used for retry). */
  const submit = useCallback(
    async (shot: Pick<Shot, 'hash'>, rollId: bigint) => {
      const adapter = wallet.adapter
      if (!adapter) return
      patchShot(shot.hash, { status: 'pending', errorCode: undefined, errorReason: undefined })
      try {
        const txHash = await adapter.shoot(rollId, shot.hash, {
          onEvent: (e) => {
            if (e.type === 'approval') setApprovalUrl(e.approvalUrl)
            if (e.type === 'submitted') {
              setApprovalUrl(null)
              patchShot(shot.hash, { txHash: e.hash })
            }
          },
        })
        patchShot(shot.hash, { status: 'confirmed', txHash })
      } catch (err) {
        const { code, reason } = classifyTxError(err)
        // the hash is already on-chain → an earlier attempt actually landed
        if (reason === 'HashAlreadyUsed') patchShot(shot.hash, { status: 'confirmed' })
        else patchShot(shot.hash, { status: 'failed', errorCode: code, errorReason: reason })
      } finally {
        setApprovalUrl(null)
        void chain.refetch()
      }
    },
    [chain, patchShot, wallet.adapter],
  )

  const addShot = useCallback(
    async (photo: EncodedPhoto, filmId: number) => {
      if (!onChain || !roll || !rollKey || full) return
      const record: PhotoRecord = {
        ...photo,
        rollKey,
        frame: used + 1,
        filmId,
        takenAt: Date.now(),
        status: 'pending',
      }
      const url = URL.createObjectURL(photo.blob)
      urls.current.push(url)
      setShots((prev) => [...prev, { ...record, url }])
      await photoStore.put(record)
      void submit(record, roll.id)
    },
    [full, onChain, roll, rollKey, submit, used],
  )

  const retry = useCallback(
    (hash: `0x${string}`) => {
      if (roll) void submit({ hash }, roll.id)
    },
    [roll, submit],
  )

  /** claim / develop — one at a time, tracked by the shared tx state machine */
  const runAction = useCallback(
    async (fn: (hooks: { onEvent: (e: TxEvent) => void }) => Promise<unknown>) => {
      dispatchAction({ type: 'reset' })
      try {
        await fn({
          onEvent: (e) => {
            dispatchAction(e)
            if (e.type === 'approval') setApprovalUrl(e.approvalUrl)
            if (e.type === 'submitted' || e.type === 'mined') setApprovalUrl(null)
          },
        })
      } catch (err) {
        dispatchAction({ type: 'error', ...classifyTxError(err) })
      } finally {
        setApprovalUrl(null)
        await chain.refetch()
      }
    },
    [chain],
  )

  const claim = (filmId: number) =>
    wallet.adapter && runAction((h) => wallet.adapter!.claimDailyRoll(filmId, h))
  const develop = () =>
    wallet.adapter && roll && runAction((h) => wallet.adapter!.develop(roll.id, h))

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
    addShot,
    retry,
    claim,
    develop,
  }
}
