'use client'

import { ReviewSheet, type Shot } from '@/features/camera'
import { getStock, useStockName } from '@/features/film'
import { countdown, photoStore, rollStage, useNowSec, useRoll } from '@/features/roll'
import {
  activeChain,
  chainRollContract,
  classifyTxError,
  isBusy,
  txReducer,
  useWallet,
} from '@/features/wallet'
import { chainRollAbi } from '@chainroll/contracts'
import { Badge, Button, EmptyState, FilmStrip, LatentFrame, cn } from '@chainroll/ui'
import { ArrowLeft, Aperture, Beaker } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useReducer, useRef, useState } from 'react'
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
  const [reviewIndex, setReviewIndex] = useState<number | null>(null)
  const [tx, dispatch] = useReducer(txReducer, { status: 'idle' })
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
  const progress =
    stage === 'developing' ? 1 - Math.max(0, roll.developReadyAt - now) / delaySec : 0
  const viewable = shots.filter(Boolean) as Shot[]

  const develop = async () => {
    if (!w.adapter) return
    dispatch({ type: 'reset' })
    try {
      await w.adapter.develop(roll.id, { onEvent: dispatch })
    } catch (e) {
      dispatch({ type: 'error', ...classifyTxError(e) })
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
              <p className="text-sm text-fg-muted">
                {t('panel.shooting', { left: roll.frames - roll.framesUsed })}
              </p>
              {isOwner && (
                <Button variant="primary" asChild>
                  <Link href="/camera">
                    <Aperture />
                    {t('panel.keepShooting')}
                  </Link>
                </Button>
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
                <Button variant="inverse" disabled={isBusy(tx)} onClick={develop}>
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
              <Button disabled>{t('panel.postSoon')}</Button>
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
