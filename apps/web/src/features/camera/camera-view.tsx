'use client'

import {
  FILM_STOCKS,
  FilmRenderer,
  WebGLUnavailableError,
  captureSize,
  encodeCanvas,
  getStock,
  useStockName,
} from '@/features/film'
import { rollStage, useNowSec } from '@/features/roll'
import { ConnectSheet, WalletButton, isBusy } from '@/features/wallet'
import { Button, FilmStrip, FrameCounter, LatentFrame, RebateLabel, cn } from '@chainroll/ui'
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Grid3x3,
  RefreshCcw,
  Sun,
  SwitchCamera,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ReviewSheet } from './review-sheet'
import { BlockConfirmHud } from './block-confirm-hud'
import { haptic, playShutter } from './shutter-fx'
import { useCamera, type CameraStatus } from './use-camera'
import { useRollSession } from './use-roll-session'

const BLOCKING: CameraStatus[] = ['denied', 'no-camera', 'insecure', 'unsupported', 'error']
const EV_STEPS = [-1, -0.5, 0, 0.5, 1] as const

function formatQuartzDate(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const yy = parts.find((p) => p.type === 'year')?.value ?? '26'
  const mm = parts.find((p) => p.type === 'month')?.value ?? '01'
  const dd = parts.find((p) => p.type === 'day')?.value ?? '01'
  return `'${yy} ${mm} ${dd}`
}

function burnQuartzDateStamp(sourceCanvas: HTMLCanvasElement, stamp: string): HTMLCanvasElement {
  const out = document.createElement('canvas')
  out.width = sourceCanvas.width
  out.height = sourceCanvas.height
  const ctx = out.getContext('2d')
  if (!ctx) return sourceCanvas

  ctx.drawImage(sourceCanvas, 0, 0)

  const fontSize = Math.max(22, Math.round(out.width * 0.044))
  const padX = Math.round(out.width * 0.055)
  const padY = Math.round(out.height * 0.042)

  ctx.save()
  ctx.font = `700 ${fontSize}px ui-monospace, "Courier New", monospace`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'

  // Outer amber-orange LED bloom (classic 90s quartz back glow)
  ctx.shadowColor = 'rgba(255, 78, 12, 0.92)'
  ctx.shadowBlur = Math.round(fontSize * 0.45)
  ctx.fillStyle = 'rgba(255, 118, 32, 0.95)'
  ctx.fillText(stamp, out.width - padX, out.height - padY)

  // Inner bright quartz core
  ctx.shadowColor = 'rgba(255, 175, 70, 0.85)'
  ctx.shadowBlur = Math.round(fontSize * 0.14)
  ctx.fillStyle = 'rgba(255, 198, 108, 0.96)'
  ctx.fillText(stamp, out.width - padX, out.height - padY)
  ctx.restore()

  return out
}

export function CameraView() {
  const t = useTranslations('camera')
  const format = useFormatter()
  const cam = useCamera()
  const nowSec = useNowSec()
  const stockName = useStockName()

  const previewRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<FilmRenderer | null>(null)
  const captureRef = useRef<FilmRenderer | null>(null)
  const [glError, setGlError] = useState(false)

  const [pickedFilm, setPickedFilm] = useState(FILM_STOCKS[0]!.id)
  // /camera?film=2 (from the films catalog) preselects a stock for the next roll
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('film'))
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL
    if (FILM_STOCKS.some((s) => s.id === id)) setPickedFilm(id)
  }, [])
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(false)
  const [reviewIndex, setReviewIndex] = useState<number | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [dateStamp, setDateStamp] = useState(true)
  const [showGrid, setShowGrid] = useState(false)
  const [ev, setEv] = useState<(typeof EV_STEPS)[number]>(0)
  const [muted, setMuted] = useState(false)

  const session = useRollSession(getStock(pickedFilm).frames)
  const { shots, used, frames, full, phase, roll } = session
  // an open on-chain roll fixes the film; otherwise the picker decides
  const filmId = phase === 'open' && roll ? roll.filmId : pickedFilm
  const stock = getStock(filmId)
  const activeLook = useMemo(
    () => ({ ...stock.look, exposure: stock.look.exposure + ev }),
    [stock.look, ev],
  )
  const quartzDate = useMemo(() => formatQuartzDate(), [])
  const filmLocked = phase === 'open'

  const live = cam.status === 'live'

  // ── preview renderer ─────────────────────────────────────
  useEffect(() => {
    const canvas = previewRef.current
    if (!canvas) return
    try {
      rendererRef.current = new FilmRenderer(canvas)
    } catch (e) {
      // no WebGL2, or a driver that can't compile the shader → show the fallback, don't crash
      if (!(e instanceof WebGLUnavailableError)) console.error(e)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGlError(true)
      return
    }
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      rendererRef.current?.setSize(
        Math.round(entry.contentRect.width * dpr),
        Math.round(entry.contentRect.height * dpr),
      )
    })
    ro.observe(canvas)
    return () => {
      ro.disconnect()
      rendererRef.current?.dispose()
      rendererRef.current = null
      captureRef.current?.dispose()
      captureRef.current = null
    }
  }, [])

  // ── render loop ──────────────────────────────────────────
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const src = cam.video.current
      if (src && rendererRef.current) {
        rendererRef.current.render(src, activeLook, {
          mirror: cam.facing === 'user',
        })
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [cam.video, activeLook, cam.facing])

  // ── capture ──────────────────────────────────────────────
  const canShoot = live && !busy && !glError && !full && phase === 'open'

  const shoot = async () => {
    const src = cam.video.current
    if (!src || !canShoot) return
    setBusy(true)
    playShutter(muted)
    haptic()
    setFlash(true)
    setTimeout(() => setFlash(false), 80)
    try {
      const sw = src.videoWidth
      const sh = src.videoHeight
      const { width, height } = captureSize(sw, sh)
      captureRef.current ??= new FilmRenderer(document.createElement('canvas'), {
        preserveDrawingBuffer: true,
      })
      const r = captureRef.current
      r.setSize(width, height)
      r.render(src, activeLook, {
        mirror: cam.facing === 'user',
        seed: Math.random(),
      })
      const finalCanvas = dateStamp ? burnQuartzDateStamp(r.canvas, quartzDate) : r.canvas
      await session.addShot(await encodeCanvas(finalCanvas), filmId)
    } finally {
      setBusy(false)
    }
  }

  const blocked = BLOCKING.includes(cam.status)
  const lastShot = shots.at(-1)
  const developed = Boolean(roll && rollStage(roll, nowSec) === 'developed')
  const actionBusy =
    isBusy(session.action) ||
    session.hud?.stage === 'signing' ||
    session.hud?.stage === 'mining'

  // ── status strip copy ────────────────────────────────────
  const pendingCount = shots.filter((s) => s.status === 'pending').length
  const failedCount = shots.filter((s) => s.status === 'failed').length
  const statusLine = !session.onChain
    ? t('chain.connectFirst')
    : session.approvalUrl
      ? t('chain.approve')
      : pendingCount > 0
        ? t('chain.saving', { count: pendingCount })
        : failedCount > 0
          ? t('chain.failed', { count: failedCount })
          : session.action.status === 'failed'
            ? t(`chain.errors.${session.action.code}`)
            : t('chain.onChain')

  const hasUrgentStatus = Boolean(
    !session.onChain ||
      session.approvalUrl ||
      pendingCount > 0 ||
      failedCount > 0 ||
      session.action.status === 'failed',
  )

  return (
    <div data-mode="analog" className="grain flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      {/* top bar */}
      <header className="relative z-10 flex h-11 shrink-0 items-center justify-between gap-2 px-3 sm:h-14">
        <Link
          href="/"
          aria-label={t('back')}
          className="rounded-xs p-1.5 text-fg-muted hover:text-fg sm:p-2"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <RebateLabel className="truncate">
          {stock.code} · {frames} EXP{roll ? ` · #${roll.id}` : ''}
        </RebateLabel>
        <FrameCounter used={used} total={frames} />
      </header>

      {/* chain status strip — compact on mobile */}
      <div className="flex min-h-8 shrink-0 items-center justify-between gap-2 px-3 pb-1.5 text-2xs sm:min-h-9 sm:px-4 sm:pb-2">
        <span
          role="status"
          className={cn(
            'min-w-0 truncate',
            !hasUrgentStatus && 'hidden sm:inline',
            failedCount > 0 || session.action.status === 'failed' ? 'text-danger' : 'text-fg-muted',
          )}
        >
          {statusLine}
          {session.approvalUrl && (
            <a
              href={session.approvalUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-2 inline-flex items-center gap-1 text-frame underline underline-offset-2"
            >
              {t('chain.openApproval')} <ExternalLink className="size-3" />
            </a>
          )}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {roll && used > 0 && (
            <Link
              href={`/darkroom/${roll.id}`}
              className="inline-flex h-7 items-center rounded-xs border border-frame/40 bg-frame/10 px-2 font-mono text-[11px] whitespace-nowrap text-frame hover:bg-frame/20 sm:h-8 sm:text-2xs"
            >
              {t('chain.earlyDevelopLink', { used })}
            </Link>
          )}
          <WalletButton onOpen={() => setConnectOpen(true)} />
        </div>
      </div>

      {/* viewfinder */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3">
        <div className="relative aspect-[2/3] h-full max-h-full max-w-full">
          <canvas
            ref={previewRef}
            aria-label={t('viewfinder')}
            role="img"
            className={cn('absolute inset-0 size-full bg-black', !live && 'opacity-0')}
          />
          {[
            'top-2 left-2 border-t border-l',
            'top-2 right-2 border-t border-r',
            'bottom-2 left-2 border-b border-l',
            'bottom-2 right-2 border-b border-r',
          ].map((c) => (
            <span key={c} aria-hidden className={`absolute size-4 border-frame/70 ${c}`} />
          ))}

          {/* Rule-of-thirds viewfinder grid */}
          {showGrid && live && (
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <span className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
              <span className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
              <span className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
              <span className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
            </div>
          )}

          {/* 90s Quartz Date Imprint live preview */}
          {dateStamp && live && (
            <span
              aria-hidden
              className="pointer-events-none absolute right-4 bottom-3.5 font-mono text-sm font-bold tracking-widest text-[#ffc66c] select-none sm:text-base"
              style={{
                textShadow: '0 0 8px rgba(255, 78, 12, 0.95), 0 0 3px rgba(255, 165, 64, 0.9)',
              }}
            >
              {quartzDate}
            </span>
          )}

          {/* Floating translucent Pro 35mm HUD inside viewfinder */}
          {live && (
            <div className="absolute top-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-black/55 px-2 py-1 font-mono text-[10px] backdrop-blur-xs">
              <button
                type="button"
                aria-pressed={dateStamp}
                onClick={() => setDateStamp((v) => !v)}
                className={cn(
                  'inline-flex h-5 items-center gap-1 rounded-full px-1.5 whitespace-nowrap transition-colors',
                  dateStamp ? 'bg-frame/25 text-frame' : 'text-white/70 hover:text-white',
                )}
              >
                <Calendar className="size-2.5" />
                <span>{t('pro.date')}</span>
              </button>
              <button
                type="button"
                aria-pressed={showGrid}
                onClick={() => setShowGrid((v) => !v)}
                className={cn(
                  'inline-flex h-5 items-center gap-1 rounded-full px-1.5 whitespace-nowrap transition-colors',
                  showGrid ? 'bg-frame/25 text-frame' : 'text-white/70 hover:text-white',
                )}
              >
                <Grid3x3 className="size-2.5" />
                <span>{t('pro.grid')}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const idx = EV_STEPS.indexOf(ev)
                  const next = EV_STEPS[(idx + 1) % EV_STEPS.length]!
                  setEv(next)
                }}
                className={cn(
                  'inline-flex h-5 items-center gap-1 rounded-full px-1.5 tabular whitespace-nowrap transition-colors',
                  ev !== 0 ? 'bg-frame/25 text-frame' : 'text-white/70 hover:text-white',
                )}
              >
                <Sun className="size-2.5" />
                <span>{ev > 0 ? `+${ev.toFixed(1)}` : ev.toFixed(1)}</span>
              </button>
              <button
                type="button"
                aria-pressed={!muted}
                onClick={() => setMuted((v) => !v)}
                aria-label={muted ? t('pro.muted') : t('pro.sfx')}
                className={cn(
                  'inline-flex h-5 items-center rounded-full px-1.5 transition-colors',
                  !muted ? 'text-white/90 hover:text-white' : 'text-white/40 hover:text-white/70',
                )}
              >
                {muted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
              </button>
            </div>
          )}

          {!live && !blocked && !glError && (
            <div className="absolute inset-0 grid place-items-center">
              <FilmStrip label={t('starting')} />
            </div>
          )}
          {(blocked || glError) && (
            <div
              role="alert"
              className="absolute inset-0 flex flex-col items-start justify-center gap-4 border border-border p-6"
            >
              <span className="font-mono text-2xs text-frame">▸ 00</span>
              <p className="font-display text-2xl">
                {glError ? t('status.webgl.title') : t(`status.${cam.status}.title`)}
              </p>
              <p className="text-sm text-fg-muted">
                {glError ? t('status.webgl.body') : t(`status.${cam.status}.body`)}
              </p>
              <div className="flex flex-wrap gap-2">
                {!glError && cam.status !== 'insecure' && cam.status !== 'unsupported' && (
                  <Button size="sm" onClick={cam.retry}>
                    <RefreshCcw />
                    {t('retry')}
                  </Button>
                )}
              </div>
            </div>
          )}

          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-0 bg-white transition-opacity duration-[var(--dur-fast)]',
              flash ? 'opacity-90' : 'opacity-0',
            )}
          />
        </div>
      </div>

      {/* film picker */}
      <div className="shrink-0 px-3 pt-2">
        <div role="radiogroup" aria-label={t('film')} className="flex justify-center gap-1.5 sm:gap-2">
          {FILM_STOCKS.map((s) => {
            const selected = s.id === filmId
            const locked = filmLocked && !selected
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={locked}
                onClick={() => setPickedFilm(s.id)}
                className={cn(
                  'flex items-center gap-2 rounded-xs border px-2.5 py-1.5 text-xs transition-colors',
                  selected
                    ? 'border-frame text-fg'
                    : 'border-border text-fg-muted hover:border-fg-muted',
                  locked && 'opacity-35',
                )}
              >
                <span
                  aria-hidden
                  className="size-3.5 rounded-full"
                  style={{ background: s.swatch }}
                />
                {stockName(s.id)}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 h-4 text-center text-2xs text-fg-muted">
          {full
            ? t('rollFull')
            : filmLocked
              ? t('filmLocked')
              : phase === 'claim'
                ? t('chain.pickFilm')
                : ''}
        </p>
      </div>

      {/* controls */}
      <div className="grid h-24 shrink-0 grid-cols-3 items-center px-5 pb-[env(safe-area-inset-bottom)] sm:h-28 sm:px-6">
        <div className="flex justify-start">
          {lastShot ? (
            <button
              type="button"
              onClick={() => setReviewIndex(shots.length - 1)}
              aria-label={t('review')}
              className="relative size-14 overflow-hidden border border-border"
            >
              {developed ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob: URL, not optimizable
                <img src={lastShot.url} alt="" className="size-full object-cover" />
              ) : (
                <LatentFrame frame={lastShot.frame} className="size-full" />
              )}
              <span className="absolute right-0 bottom-0 bg-black/70 px-1 font-mono text-[10px] text-frame">
                {String(lastShot.frame).padStart(2, '0')}
              </span>
              {lastShot.status === 'pending' && (
                <span
                  aria-hidden
                  className="absolute top-1 left-1 size-1.5 animate-pulse rounded-full bg-warning"
                />
              )}
              {lastShot.status === 'failed' && (
                <span
                  aria-hidden
                  className="absolute top-1 left-1 size-1.5 rounded-full bg-danger"
                />
              )}
            </button>
          ) : (
            <span className="size-14 border border-dashed border-border" aria-hidden />
          )}
        </div>

        <div className="flex justify-center">
          {phase === 'connect' ? (
            <Button variant="primary" onClick={() => setConnectOpen(true)}>
              {t('chain.connectToShoot')}
            </Button>
          ) : phase === 'loading' ? (
            <FilmStrip className="w-24" label={t('chain.loading')} />
          ) : phase === 'claim' ? (
            session.canClaim ? (
              <Button
                variant="primary"
                disabled={actionBusy}
                onClick={() => session.claim(pickedFilm)}
              >
                {actionBusy ? t('chain.claiming') : t('chain.claim')}
              </Button>
            ) : (
              <span className="text-center font-mono text-2xs text-fg-muted">
                {t('chain.nextRoll', {
                  time: format.dateTime(new Date(session.nextClaimAt * 1000), {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                })}
              </span>
            )
          ) : phase === 'full' ? (
            roll && roll.developReadyAt === 0 ? (
              <Button variant="inverse" disabled={actionBusy} onClick={() => session.develop()}>
                {actionBusy ? t('chain.developing') : t('chain.develop')}
              </Button>
            ) : developed && roll ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button variant="primary" asChild>
                  <Link href={`/darkroom/${roll.id}`}>{t('chain.toDarkroom')}</Link>
                </Button>
                {session.canClaim && (
                  <Button
                    variant="secondary"
                    disabled={actionBusy}
                    onClick={() => session.claim(pickedFilm)}
                  >
                    {actionBusy ? t('chain.claiming') : t('chain.claim')}
                  </Button>
                )}
              </div>
            ) : roll ? (
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="primary" size="sm" asChild>
                    <Link href={`/darkroom/${roll.id}`}>{t('chain.toDarkroom')}</Link>
                  </Button>
                  {session.canClaim && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={actionBusy}
                      onClick={() => session.claim(pickedFilm)}
                    >
                      {actionBusy ? t('chain.claiming') : t('chain.claim')}
                    </Button>
                  )}
                </div>
                <span className="text-center font-mono text-2xs text-fg-muted">
                  {t('chain.developed', {
                    time: format.dateTime(new Date((roll?.developReadyAt ?? 0) * 1000), {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  })}
                </span>
              </div>
            ) : null
          ) : (
            <button
              type="button"
              onClick={shoot}
              disabled={!canShoot}
              aria-label={t('shutter')}
              className="group grid size-20 place-items-center rounded-full border-2 border-fg/80 transition-transform active:scale-95 disabled:opacity-40"
            >
              <span
                className={cn(
                  'size-16 rounded-full bg-fg transition-transform duration-[var(--dur-fast)]',
                  busy && 'scale-90 bg-accent',
                )}
              />
            </button>
          )}
        </div>

        <div className="flex justify-end gap-1">
          {cam.canFlip && (
            <button
              type="button"
              onClick={cam.flip}
              aria-label={t('flip')}
              className="rounded-full p-3 text-fg-muted hover:text-fg"
            >
              <SwitchCamera className="size-5" />
            </button>
          )}
        </div>
      </div>

      {session.hud && (
        <BlockConfirmHud
          task={session.hud}
          approvalUrl={session.approvalUrl}
          autoConfirm={session.autoConfirm}
          onToggleAutoConfirm={session.setAutoConfirm}
          onConfirm={session.confirmHudShot}
          onRetry={
            session.hud.kind === 'shoot'
              ? () => session.retry(session.hud!.digest)
              : session.signHudViaWallet
          }
          onDismiss={session.dismissHud}
        />
      )}

      {reviewIndex !== null && (
        <ReviewSheet
          shots={shots}
          index={reviewIndex}
          onIndex={setReviewIndex}
          onClose={() => setReviewIndex(null)}
          onRetry={session.retry}
          developed={developed}
        />
      )}
      <ConnectSheet open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  )
}
