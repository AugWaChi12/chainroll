'use client'

import { BlockConfirmHud, ReviewSheet, type BlockHudTask, type Shot } from '@/features/camera'
import { PostComposerModal, useFeedStore, type PublishableFrame } from '@/features/feed'
import { getStock, useStockName } from '@/features/film'
import { countdown, developRollOnPage, photoStore, rollStage, useNowSec, useRoll } from '@/features/roll'
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
import { Aperture, ArrowLeft, Beaker, Check, Send } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { keccak256, stringToHex } from 'viem'
import { useReadContract } from 'wagmi'

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
  const shots = useRollShots(rollId)
  const { posts } = useFeedStore()
  const [reviewIndex, setReviewIndex] = useState<number | null>(null)
  const [composerFrame, setComposerFrame] = useState<number | null>(null)
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
  const progress =
    stage === 'developing' ? 1 - Math.min(1, remainingSec / effectiveWindow) : 0
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
              {isOwner && publishableFrames.length > 0 && (
                <Button
                  variant="primary"
                  onClick={() => setComposerFrame(publishableFrames[0]!.frame)}
                >
                  <Send />
                  {t('panel.postToFeed')}
                </Button>
              )}
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
        {developed && shots.some((s, i) => !s && i < roll.framesUsed) && (
          <p className="mt-3 text-2xs text-fg-subtle">{t('otherDevice')}</p>
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
          onConfirm={confirmDevelopOnPage}
          onSignWallet={w.adapter ? () => void signDevelopViaWallet() : undefined}
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

/** Photos of this roll on this device, indexed by frame-1 (holes where the frame lives elsewhere). */
function useRollShots(rollId: bigint) {
  const [shots, setShots] = useState<(Shot | undefined)[]>([])
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
      setShots(arr)
    })
    return () => {
      alive = false
      urls.forEach((u) => URL.revokeObjectURL(u))
      urls = []
    }
  }, [rollId])
  return shots
}
