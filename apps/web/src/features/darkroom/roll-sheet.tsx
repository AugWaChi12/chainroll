'use client'

import { BlockConfirmHud, ReviewSheet, type BlockHudTask, type Shot } from '@/features/camera'
import {
  PostComposerModal,
  getProfileMeta,
  useFeedStore,
  type FeedPost,
  type PublishableFrame,
} from '@/features/feed'
import { getStock, useStockName } from '@/features/film'
import {
  countdown,
  developRollOnPage,
  fetchCloudFramesForRoll,
  photoStore,
  rollStage,
  uploadFrameToPrivateCloud,
  useNowSec,
  useRoll,
} from '@/features/roll'
import {
  activeChain,
  chainRollContract,
  classifyTxError,
  isBusy,
  txReducer,
  useWallet,
  waitForNextKubBlock,
} from '@/features/wallet'
import { chainRollAbi } from '@chainroll/contracts'
import { Badge, Button, EmptyState, FilmStrip, LatentFrame, cn } from '@chainroll/ui'
import { Aperture, ArrowLeft, Beaker, Check, Cloud, Download, Loader2, Send } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { keccak256, stringToHex } from 'viem'
import { useReadContract } from 'wagmi'
import { exportContactSheetPng } from './contact-sheet-export'

const STAGE_TONE = {
  shooting: 'frame',
  full: 'warning',
  developing: 'danger',
  developed: 'success',
} as const
const PER_STRIP = 6

export function RollSheet({ rollId }: { rollId: bigint }) {
  const t = useTranslations('darkroom')
  const w = useWallet()
  const now = useNowSec()
  const stockName = useStockName()
  const { roll, loading, refetch } = useRoll(rollId)
  const { posts } = useFeedStore()
  const { shots, localCount, cloudCount, syncingCloud, syncNow } = useRollShots(
    rollId,
    roll,
    posts,
  )
  const [reviewIndex, setReviewIndex] = useState<number | null>(null)
  const [composerFrame, setComposerFrame] = useState<number | null>(null)
  const [exportingSheet, setExportingSheet] = useState(false)
  const [tx, dispatch] = useReducer(txReducer, { status: 'idle' })
  const [hudTask, setHudTask] = useState<BlockHudTask | null>(null)

  const publishableFrames = useMemo<PublishableFrame[]>(() => {
    if (!roll) return []
    const local = shots.filter(Boolean) as Shot[]
    if (local.length > 0) {
      return local.map((s) => ({
        frame: s.frame,
        hash: s.hash,
        txHash: s.txHash,
        url: s.url,
        blob: s.blob,
      }))
    }
    return Array.from({ length: roll.framesUsed }, (_, i) => ({
      frame: i + 1,
      hash: keccak256(stringToHex(`chainroll:${activeChain.id}:${String(roll.id)}:${i + 1}`)),
    }))
  }, [roll, shots])
  const delay = useReadContract({
    address: chainRollContract!,
    abi: chainRollAbi,
    chainId: activeChain.id,
    functionName: 'developDelay',
    query: { enabled: Boolean(chainRollContract) },
  })

  // refresh the instant development finishes so the reveal happens on screen
  const stage = roll ? rollStage(roll, now) : null
  const prevStage = useRef(stage)
  useEffect(() => {
    if (prevStage.current === 'developing' && stage === 'developed') void refetch()
    prevStage.current = stage
  }, [stage, refetch])

  if (loading)
    return (
      <div className="grid min-h-[60dvh] place-items-center">
        <FilmStrip label={t('loading')} />
      </div>
    )
  if (!roll || !stage)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <EmptyState
          title={t('notFound')}
          action={
            <Button asChild>
              <Link href="/darkroom">{t('back')}</Link>
            </Button>
          }
        />
      </div>
    )

  const stock = getStock(roll.filmId)
  const isOwner = Boolean(w.address && w.address.toLowerCase() === roll.owner.toLowerCase())
  const developed = stage === 'developed'
  const delaySec = Number(delay.data ?? 3600n)
  const remainingSec = Math.max(0, roll.developReadyAt - now)
  const effectiveWindow = remainingSec <= 15 ? 15 : delaySec
  const progress = stage === 'developing' ? 1 - Math.min(1, remainingSec / effectiveWindow) : 0
  const viewable = shots.filter(Boolean) as Shot[]

  const develop = (early = false) => {
    dispatch({ type: 'reset' })
    const digest = keccak256(
      stringToHex(`chainroll:develop:${String(roll.id)}:${early}:${roll.framesUsed}`),
    )
    setHudTask({
      kind: 'develop',
      rollId: roll.id,
      early,
      stockCode: stock.code,
      digest,
      stage: 'awaiting-confirm',
    })
  }

  const confirmDevelopOnPage = async () => {
    if (!hudTask || hudTask.kind !== 'develop') return
    setHudTask({ ...hudTask, stage: 'mining', errorCode: undefined })
    const { blockNumber } = await waitForNextKubBlock()
    const { txHash } = developRollOnPage(hudTask.rollId, Boolean(hudTask.early), 15)
    setHudTask({ ...hudTask, stage: 'confirmed', txHash, blockNumber })
    window.setTimeout(() => {
      setHudTask((cur) => (cur?.stage === 'confirmed' ? null : cur))
    }, 2200)
  }

  const signDevelopViaWallet = async () => {
    if (!hudTask || hudTask.kind !== 'develop' || !w.adapter) {
      confirmDevelopOnPage()
      return
    }
    setHudTask({ ...hudTask, stage: 'signing', errorCode: undefined })
    try {
      let txHash: `0x${string}` | undefined
      const fn = hudTask.early ? w.adapter.developEarly : w.adapter.develop
      await fn(roll.id, {
        onEvent: (e) => {
          dispatch(e)
          if (e.type === 'submitted') {
            txHash = e.hash
            setHudTask({ ...hudTask, stage: 'mining', txHash: e.hash })
          }
        },
      })
      setHudTask({ ...hudTask, stage: 'confirmed', txHash })
      window.setTimeout(() => {
        setHudTask((cur) => (cur?.stage === 'confirmed' ? null : cur))
      }, 2400)
    } catch (e) {
      const { code } = classifyTxError(e)
      setHudTask({ ...hudTask, stage: 'failed', errorCode: code })
    } finally {
      await refetch()
    }
  }

  return (
    <div className={cn('min-h-full', stage === 'developing' && 'safelight')}>
      <div className="mx-auto max-w-5xl px-4 pt-8 pb-16 md:px-8">
        <Link
          href="/darkroom"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="size-4" />
          {t('back')}
        </Link>

        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-2xs tracking-wide text-frame">
              ▸ {stock.code} · #{String(roll.id)}
            </span>
            <h1 className="font-display text-3xl leading-none md:text-4xl">
              {stockName(stock.id)}
            </h1>
            <span className="font-mono text-xs text-fg-muted tabular">
              {String(roll.framesUsed).padStart(2, '0')} / {roll.frames} {t('frames')}
            </span>
          </div>
          <Badge tone={STAGE_TONE[stage]} dot>
            {t(`stage.${stage}`)}
          </Badge>
        </header>

        {/* stage panel */}
        <section className="mb-6 border border-border bg-bg-raised p-5">
          {stage === 'shooting' && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm text-fg-muted">
                  {t('panel.shooting', { left: roll.frames - roll.framesUsed })}
                </p>
                {tx.status === 'failed' && (
                  <p className="text-sm text-danger">{t(`errors.${tx.code}`)}</p>
                )}
              </div>
              {isOwner && (
                <div className="flex flex-wrap items-center gap-2">
                  {roll.framesUsed > 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isBusy(tx)}
                      onClick={() => void develop(true)}
                    >
                      <Beaker />
                      {isBusy(tx) ? t('panel.developing') : t('panel.developEarly')}
                    </Button>
                  )}
                  <Button variant="primary" size="sm" asChild>
                    <Link href="/camera">
                      <Aperture />
                      {t('panel.keepShooting')}
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}
          {stage === 'full' && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <p className="font-medium">{t('panel.fullTitle')}</p>
                <p className="text-sm text-fg-muted">
                  {t('panel.fullBody', { minutes: Math.round(delaySec / 60) })}
                </p>
                {tx.status === 'failed' && (
                  <p className="text-sm text-danger">{t(`errors.${tx.code}`)}</p>
                )}
                {tx.status === 'awaiting-approval' && (
                  <a
                    href={tx.approvalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-frame underline"
                  >
                    {t('panel.openApproval')}
                  </a>
                )}
              </div>
              {isOwner && (
                <Button variant="inverse" disabled={isBusy(tx)} onClick={() => void develop(false)}>
                  <Beaker />
                  {isBusy(tx) ? t('panel.developing') : t('panel.develop')}
                </Button>
              )}
            </div>
          )}
          {stage === 'developing' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="font-medium text-danger">{t('panel.inTank')}</p>
                <span
                  className="font-mono text-3xl tabular text-danger"
                  role="timer"
                  aria-live="off"
                >
                  {countdown(roll.developReadyAt, now)}
                </span>
              </div>
              <div
                className="h-1 w-full bg-bg-sunken"
                role="progressbar"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full bg-danger transition-[width] duration-1000 ease-linear"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <p className="text-xs text-fg-muted">{t('panel.inTankBody')}</p>
            </div>
          )}
          {stage === 'developed' && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <p className="font-medium text-success">{t('panel.doneTitle')}</p>
                <p className="text-sm text-fg-muted">{t('panel.doneBody')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={exportingSheet}
                  onClick={async () => {
                    setExportingSheet(true)
                    try {
                      const profile = getProfileMeta(roll.owner)
                      await exportContactSheetPng({
                        rollId: roll.id,
                        stockCode: stock.code,
                        stockName: stockName(stock.id),
                        owner: roll.owner,
                        ownerHandle: profile.handle,
                        totalFrames: roll.frames,
                        framesUsed: roll.framesUsed,
                        frames: Array.from({ length: roll.frames }, (_, idx) => {
                          const s = shots[idx]
                          return {
                            frame: idx + 1,
                            url: s?.url,
                            exposed: idx + 1 <= roll.framesUsed || Boolean(s),
                          }
                        }),
                      })
                    } finally {
                      setExportingSheet(false)
                    }
                  }}
                >
                  {exportingSheet ? <Loader2 className="animate-spin" /> : <Download />}
                  {exportingSheet ? t('panel.exportingSheet') : t('panel.exportSheet')}
                </Button>
                {isOwner && publishableFrames.length > 0 && (
                  <Button
                    variant="primary"
                    onClick={() => setComposerFrame(publishableFrames[0]!.frame)}
                  >
                    <Send />
                    {t('panel.postToFeed')}
                  </Button>
                )}
                {isOwner &&
                  localCount > 0 &&
                  (cloudCount < localCount ? (
                    <Button
                      variant="secondary"
                      disabled={syncingCloud}
                      onClick={() => void syncNow()}
                    >
                      {syncingCloud ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Cloud className="size-4" />
                      )}
                      {syncingCloud ? t('syncingCloud') : t('uploadToCloud')}
                    </Button>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 border border-success/40 bg-success/10 px-2.5 py-1.5 font-mono text-2xs text-success">
                      <Check className="size-3" />
                      {t('cloudSynced', { count: cloudCount })}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </section>

        {/* contact sheet: strips of six on a black negative sheet */}
        <section
          aria-label={t('sheet')}
          className="grain flex flex-col gap-3 bg-[#0b0908] p-3 md:p-5"
        >
          {Array.from({ length: Math.ceil(roll.frames / PER_STRIP) }, (_, s) => (
            <div key={s} className="flex flex-col">
              <Sprockets />
              <div className="grid grid-cols-6 gap-1 px-1 py-1">
                {Array.from({ length: PER_STRIP }, (_, k) => {
                  const frame = s * PER_STRIP + k + 1
                  if (frame > roll.frames) return <div key={k} />
                  const shot = shots[frame - 1]
                  const exposed = frame <= roll.framesUsed || Boolean(shot)
                  const isPosted = Boolean(
                    shot &&
                    posts.some((p) => p.photoHash.toLowerCase() === shot.hash.toLowerCase()),
                  )
                  return (
                    <div key={k} className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        disabled={!developed || !shot}
                        onClick={() => shot && setReviewIndex(viewable.indexOf(shot))}
                        aria-label={t('frameLabel', { frame })}
                        className="relative aspect-[2/3] overflow-hidden disabled:cursor-default"
                      >
                        {developed && shot ? (
                          // eslint-disable-next-line @next/next/no-img-element -- blob: URL
                          <img
                            src={shot.url}
                            alt=""
                            className="size-full object-cover transition-transform hover:scale-[1.03]"
                            style={{
                              animation: `develop-in 1400ms var(--motion-out) ${frame * 70}ms both`,
                            }}
                          />
                        ) : exposed ? (
                          <LatentFrame
                            frame={frame}
                            status={shot?.status}
                            className={cn('size-full', developed && 'opacity-50')}
                          />
                        ) : (
                          <div className="size-full border border-dashed border-white/10" />
                        )}
                        {developed && isPosted && (
                          <span className="absolute top-1 right-1 inline-flex size-4 items-center justify-center rounded-full bg-success text-white">
                            <Check className="size-2.5" />
                          </span>
                        )}
                      </button>
                      <span className="font-mono text-[9px] tracking-[0.15em] text-frame/70">
                        ▸ {frame}
                        {frame % 2 ? 'A' : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
              <Sprockets />
              <span className="mt-1 text-right font-mono text-[9px] tracking-[0.25em] text-frame/50">
                {stock.code} · {stock.iso}
              </span>
            </div>
          ))}
        </section>
        {developed &&
          Array.from({ length: roll.framesUsed }, (_, i) => i).some((i) => !shots[i]) && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border border-border bg-bg-raised px-3.5 py-2.5">
              <p className="text-2xs text-fg-muted">{t('otherDeviceNeedsUpload')}</p>
              <Button
                variant="secondary"
                size="sm"
                disabled={syncingCloud}
                onClick={() => void syncNow()}
              >
                {syncingCloud ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Cloud className="size-3.5" />
                )}
                {syncingCloud ? t('syncingCloud') : t('refreshCloud')}
              </Button>
            </div>
          )}
      </div>

      {reviewIndex !== null && reviewIndex >= 0 && (
        <ReviewSheet
          shots={viewable}
          index={reviewIndex}
          onIndex={setReviewIndex}
          onClose={() => setReviewIndex(null)}
          developed={developed}
          onPostFrame={
            developed && isOwner
              ? (frame) => {
                  setReviewIndex(null)
                  setComposerFrame(frame)
                }
              : undefined
          }
        />
      )}

      {composerFrame !== null && (
        <PostComposerModal
          rollId={Number(roll.id)}
          filmId={roll.filmId}
          shooter={roll.owner}
          frames={publishableFrames}
          initialFrame={composerFrame}
          onClose={() => setComposerFrame(null)}
        />
      )}

      {hudTask && (
        <BlockConfirmHud
          task={hudTask}
          onConfirm={() => void signDevelopViaWallet()}
          onRetry={() => void signDevelopViaWallet()}
          onDismiss={() => setHudTask(null)}
        />
      )}
    </div>
  )
}

function Sprockets() {
  return (
    <div
      aria-hidden
      className="h-2.5"
      style={{
        backgroundImage:
          'repeating-linear-gradient(90deg, transparent 0 7px, rgba(242,237,228,.14) 7px 15px, transparent 15px 22px)',
        backgroundSize: '22px 6px',
        backgroundRepeat: 'repeat-x',
        backgroundPosition: '0 center',
      }}
    />
  )
}

/**
 * Photos of this roll merged from:
 * 1) Local IndexedDB on this device (instant, full Blob)
 * 2) R2 Cloud Sync (cross-device Phone <-> PC, zero-SIWE)
 * 3) Already-published Feed posts (public R2 URLs)
 * Also silently backfills any local-only IndexedDB frames up to R2.
 */
function useRollShots(
  rollId: bigint,
  roll: { id: bigint; filmId: number; frames: number } | null,
  posts: FeedPost[],
) {
  const [localShots, setLocalShots] = useState<(Shot | undefined)[]>([])
  const [cloudShots, setCloudShots] = useState<(Shot | undefined)[]>([])
  const [syncingCloud, setSyncingCloud] = useState(false)
  const [syncNonce, setSyncNonce] = useState(0)
  const syncedUploadHashes = useRef<Set<string>>(new Set())

  const syncNow = () => {
    syncedUploadHashes.current.clear()
    setSyncNonce((n) => n + 1)
  }

  // 1. Load local IndexedDB shots on this device
  useEffect(() => {
    let alive = true
    let urls: string[] = []
    void photoStore.listRoll(`${activeChain.id}:${rollId}`).then((rows) => {
      if (!alive) return
      const arr: (Shot | undefined)[] = []
      for (const r of rows) {
        const url = URL.createObjectURL(r.blob)
        urls.push(url)
        arr[r.frame - 1] = { ...r, url }
      }
      setLocalShots(arr)
    })
    return () => {
      alive = false
      urls.forEach((u) => URL.revokeObjectURL(u))
      urls = []
    }
  }, [rollId])

  const rollFilmId = roll?.filmId ?? 0
  const rollFrames = roll?.frames ?? 0

  // 1b. Auto-upload any local IndexedDB frames for this roll to Private R2 immediately (zero SIWE needed!)
  useEffect(() => {
    if (!rollFilmId || !rollFrames) return
    let alive = true
    const run = async () => {
      const localRows = await photoStore.listRoll(`${activeChain.id}:${rollId}`)
      if (!alive || localRows.length === 0) return
      const toUpload = localRows.filter((row) => {
        const h = row.hash.toLowerCase()
        if (syncedUploadHashes.current.has(h)) return false
        syncedUploadHashes.current.add(h)
        return true
      })
      if (toUpload.length === 0) return
      setSyncingCloud(true)
      try {
        const uploaded = await Promise.all(
          toUpload.map(async (row) => {
            const ok = await uploadFrameToPrivateCloud({
              rollId,
              frame: row.frame,
              photoHash: row.hash,
              filmId: row.filmId || rollFilmId,
              frames: rollFrames,
              blob: row.blob,
              txHash: row.txHash,
            })
            return ok ? row : null
          }),
        )
        if (!alive) return
        const added = uploaded.filter((r): r is NonNullable<typeof r> => r !== null)
        if (added.length > 0) {
          setCloudShots((prev) => {
            const next = [...prev]
            for (const row of added) {
              next[row.frame - 1] = {
                ...row,
                url: `/api/rolls/${String(rollId)}/frames/${row.hash.toLowerCase()}`,
              }
            }
            return next
          })
        }
      } finally {
        if (alive) setSyncingCloud(false)
      }
    }
    void run()
    return () => {
      alive = false
    }
  }, [rollFilmId, rollFrames, rollId, syncNonce])

  // 2. Fetch R2 cloud-synced frames from other devices immediately (zero SIWE required)
  useEffect(() => {
    if (!rollFilmId || !rollFrames) return
    let alive = true
    const run = async () => {
      setSyncingCloud(true)
      try {
        const res = await fetchCloudFramesForRoll(rollId)
        if (!alive) return
        setCloudShots((prev) => {
          const next = [...prev]
          for (const f of res.frames) {
            next[f.frame - 1] = {
              rollKey: `${activeChain.id}:${rollId}`,
              frame: f.frame,
              filmId: rollFilmId,
              hash: f.photoHash,
              txHash: f.txHash,
              takenAt: f.createdAt,
              status: 'confirmed',
              blob: new Blob(),
              bytes: 0,
              width: 0,
              height: 0,
              mime: 'image/webp',
              quality: 0.9,
              url: f.url,
            }
          }
          return next
        })
      } finally {
        if (alive) setSyncingCloud(false)
      }
    }
    void run()
    return () => {
      alive = false
    }
  }, [rollFilmId, rollFrames, rollId, syncNonce])

  // 3. Merge Local > Cloud Private R2 > Already-Published Feed Post
  const shots = useMemo<(Shot | undefined)[]>(() => {
    const rollNum = Number(rollId)
    const maxLen = Math.max(localShots.length, cloudShots.length, roll?.frames ?? 0)
    const merged: (Shot | undefined)[] = []

    const postsByFrame = new Map<number, FeedPost>()
    for (const p of posts) {
      if (p.rollId === rollNum && p.imageDataUrl) {
        postsByFrame.set(p.frame, p)
      }
    }

    for (let i = 0; i < maxLen; i++) {
      const local = localShots[i]
      if (local) {
        merged[i] = local
        continue
      }
      const cloud = cloudShots[i]
      if (cloud) {
        merged[i] = cloud
        continue
      }
      const pub = postsByFrame.get(i + 1)
      if (pub?.imageDataUrl) {
        merged[i] = {
          rollKey: `${activeChain.id}:${rollId}`,
          frame: pub.frame,
          filmId: pub.filmId,
          hash: pub.photoHash as `0x${string}`,
          txHash: pub.txHash as `0x${string}` | undefined,
          takenAt: pub.createdAt,
          status: 'confirmed',
          blob: new Blob(),
          bytes: 0,
          width: 0,
          height: 0,
          mime: 'image/webp',
          quality: 0.9,
          url: pub.imageDataUrl,
        }
      }
    }
    return merged
  }, [cloudShots, localShots, posts, roll?.frames, rollId])

  return {
    shots,
    localCount: localShots.filter(Boolean).length,
    cloudCount: cloudShots.filter(Boolean).length,
    syncingCloud,
    syncNow,
  }
}
