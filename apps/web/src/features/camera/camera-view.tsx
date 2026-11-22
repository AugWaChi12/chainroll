'use client'

import {
  FILM_STOCKS,
  FilmRenderer,
  WebGLUnavailableError,
  captureSize,
  encodeCanvas,
  getStock,
  type FilmSource,
} from '@/features/film'
import { ConnectSheet, WalletButton, isBusy } from '@/features/wallet'
import { Button, FilmStrip, FrameCounter, RebateLabel, cn } from '@chainroll/ui'
import { ArrowLeft, ExternalLink, ImagePlus, RefreshCcw, SwitchCamera } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ReviewSheet } from './review-sheet'
import { haptic, playShutter } from './shutter-fx'
import { useCamera, type CameraStatus } from './use-camera'
import { useRollSession } from './use-roll-session'

const BLOCKING: CameraStatus[] = ['denied', 'no-camera', 'insecure', 'unsupported', 'error']

export function CameraView() {
  const t = useTranslations('camera')
  const format = useFormatter()
  const cam = useCamera()

  const previewRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<FilmRenderer | null>(null)
  const captureRef = useRef<FilmRenderer | null>(null)
  const [glError, setGlError] = useState(false)

  const [pickedFilm, setPickedFilm] = useState(FILM_STOCKS[0]!.id)
  const [image, setImage] = useState<ImageBitmap | null>(null)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(false)
  const [reviewIndex, setReviewIndex] = useState<number | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const session = useRollSession(getStock(pickedFilm).frames)
  const { shots, used, frames, full, phase, roll } = session
  // an open on-chain roll fixes the film; otherwise the picker decides
  const filmId = roll ? roll.filmId : pickedFilm
  const stock = getStock(filmId)
  const filmLocked = phase === 'open'

  const usingImage = image !== null
  const source = useCallback(
    (): FilmSource | null => image ?? cam.video.current,
    [image, cam.video],
  )
  const live = usingImage || cam.status === 'live'

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
    }
  }, [])

  // ── render loop ──────────────────────────────────────────
  useEffect(() => {
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      // still images only need grain to shimmer — ~15fps is plenty
      if (usingImage && now - last < 66) return
      last = now
      const src = source()
      if (src && rendererRef.current) {
        rendererRef.current.render(src, stock.look, {
          mirror: !usingImage && cam.facing === 'user',
        })
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [source, stock.look, usingImage, cam.facing])

  // ── capture ──────────────────────────────────────────────
  const canShoot = live && !busy && !glError && !full && phase === 'open'

  const shoot = async () => {
    const src = source()
    if (!src || !canShoot) return
    setBusy(true)
    playShutter()
    haptic()
    setFlash(true)
    setTimeout(() => setFlash(false), 80)
    try {
      const sw = src instanceof HTMLVideoElement ? src.videoWidth : src.width
      const sh = src instanceof HTMLVideoElement ? src.videoHeight : src.height
      const { width, height } = captureSize(sw, sh)
      captureRef.current ??= new FilmRenderer(document.createElement('canvas'), {
        preserveDrawingBuffer: true,
      })
      const r = captureRef.current
      r.setSize(width, height)
      r.render(src, stock.look, {
        mirror: !usingImage && cam.facing === 'user',
        seed: Math.random(),
      })
      await session.addShot(await encodeCanvas(r.canvas), filmId)
    } finally {
      setBusy(false)
    }
  }

  const onPickFile = async (file: File | undefined) => {
    if (!file) return
    const bmp = await createImageBitmap(file)
    image?.close()
    setImage(bmp)
  }

  const blocked = !usingImage && BLOCKING.includes(cam.status)
  const lastShot = shots.at(-1)
  const actionBusy = isBusy(session.action)

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

  return (
    <div data-mode="analog" className="grain flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      {/* top bar */}
      <header className="relative z-10 flex h-14 shrink-0 items-center justify-between gap-2 px-3">
        <Link
          href="/"
          aria-label={t('back')}
          className="rounded-xs p-2 text-fg-muted hover:text-fg"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <RebateLabel className="truncate">
          {stock.code} · {frames} EXP{roll ? ` · #${roll.id}` : ''}
        </RebateLabel>
        <FrameCounter used={used} total={frames} />
      </header>

      {/* chain status strip */}
      <div className="flex min-h-9 shrink-0 items-center justify-between gap-2 px-4 pb-2 text-2xs">
        <span
          role="status"
          className={cn(
            'truncate',
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
        <WalletButton onOpen={() => setConnectOpen(true)} />
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
          {usingImage && (
            <span className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/60 px-2 py-0.5 font-mono text-2xs text-frame">
              {t('imageMode')}
            </span>
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
                {!glError && (
                  <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                    <ImagePlus />
                    {t('pickImage')}
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
      <div className="shrink-0 px-3 pt-3">
        <div role="radiogroup" aria-label={t('film')} className="flex justify-center gap-2">
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
                {s.name}
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
      <div className="grid h-32 shrink-0 grid-cols-3 items-center px-6 pb-[env(safe-area-inset-bottom)]">
        <div className="flex justify-start">
          {lastShot ? (
            <button
              type="button"
              onClick={() => setReviewIndex(shots.length - 1)}
              aria-label={t('review')}
              className="relative size-14 overflow-hidden border border-border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL, not optimizable */}
              <img src={lastShot.url} alt="" className="size-full object-cover" />
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
          ) : phase === 'claim' || (phase === 'full' && session.canClaim) ? (
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
            ) : (
              <span className="text-center font-mono text-2xs text-fg-muted">
                {t('chain.developed', {
                  time: format.dateTime(new Date((roll?.developReadyAt ?? 0) * 1000), {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                })}
              </span>
            )
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
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label={t('pickImage')}
            className="rounded-full p-3 text-fg-muted hover:text-fg"
          >
            <ImagePlus className="size-5" />
          </button>
          {cam.canFlip && !usingImage && (
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

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void onPickFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />

      {reviewIndex !== null && (
        <ReviewSheet
          shots={shots}
          index={reviewIndex}
          onIndex={setReviewIndex}
          onClose={() => setReviewIndex(null)}
          onRetry={session.retry}
        />
      )}
      <ConnectSheet open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  )
}
