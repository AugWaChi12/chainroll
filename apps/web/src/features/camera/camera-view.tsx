'use client'

import {
  FILM_STOCKS,
  FilmRenderer,
  WebGLUnavailableError,
  captureSize,
  encodeCanvas,
  getStock,
  type EncodedPhoto,
  type FilmSource,
} from '@/features/film'
import { Button, FilmStrip, FrameCounter, RebateLabel, cn } from '@deekub/ui'
import { ArrowLeft, ImagePlus, RefreshCcw, SwitchCamera } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ReviewSheet } from './review-sheet'
import { haptic, playShutter } from './shutter-fx'
import { useCamera, type CameraStatus } from './use-camera'

export type Shot = EncodedPhoto & { frame: number; filmId: number; url: string; takenAt: number }

const BLOCKING: CameraStatus[] = ['denied', 'no-camera', 'insecure', 'unsupported', 'error']

export function CameraView() {
  const t = useTranslations('camera')
  const cam = useCamera()

  const previewRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<FilmRenderer | null>(null)
  const captureRef = useRef<FilmRenderer | null>(null)
  const [glError, setGlError] = useState(false)

  const [filmId, setFilmId] = useState(FILM_STOCKS[0]!.id)
  const stock = getStock(filmId)
  const [image, setImage] = useState<ImageBitmap | null>(null)
  const [shots, setShots] = useState<Shot[]>([])
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState(false)
  const [reviewIndex, setReviewIndex] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const used = shots.length
  const full = used >= stock.frames
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

  // revoke object URLs on unmount
  const shotsRef = useRef(shots)
  useEffect(() => {
    shotsRef.current = shots
  }, [shots])
  useEffect(() => () => shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url)), [])

  // ── capture ──────────────────────────────────────────────
  const shoot = async () => {
    const src = source()
    if (!src || busy || full) return
    setBusy(true)
    playShutter()
    haptic()
    setFlash(true)
    setTimeout(() => setFlash(false), 80)
    try {
      const sw = src instanceof HTMLVideoElement ? src.videoWidth : src.width
      const sh = src instanceof HTMLVideoElement ? src.videoHeight : src.height
      const { width, height } = captureSize(sw, sh)
      if (!captureRef.current) {
        captureRef.current = new FilmRenderer(document.createElement('canvas'), {
          preserveDrawingBuffer: true,
        })
      }
      const r = captureRef.current
      r.setSize(width, height)
      r.render(src, stock.look, {
        mirror: !usingImage && cam.facing === 'user',
        seed: Math.random(),
      })
      const photo = await encodeCanvas(r.canvas)
      setShots((prev) => [
        ...prev,
        {
          ...photo,
          frame: prev.length + 1,
          filmId,
          url: URL.createObjectURL(photo.blob),
          takenAt: Date.now(),
        },
      ])
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

  const newRoll = () => {
    shots.forEach((s) => URL.revokeObjectURL(s.url))
    setShots([])
    setReviewIndex(null)
  }

  const blocked = !usingImage && BLOCKING.includes(cam.status)
  const lastShot = shots.at(-1)

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
          {stock.code} · {stock.frames} EXP
        </RebateLabel>
        <FrameCounter used={used} total={stock.frames} />
      </header>

      {/* viewfinder */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-3">
        <div className="relative aspect-[2/3] h-full max-h-full max-w-full">
          <canvas
            ref={previewRef}
            aria-label={t('viewfinder')}
            role="img"
            className={cn('absolute inset-0 size-full bg-black', !live && 'opacity-0')}
          />
          {/* frame corners */}
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

          {/* status overlays */}
          {!live && !blocked && (
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

          {/* shutter flash */}
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
            const locked = used > 0 && !selected
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={locked}
                onClick={() => setFilmId(s.id)}
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
          {full ? t('rollFull') : used > 0 ? t('filmLocked') : ''}
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
            </button>
          ) : (
            <span className="size-14 border border-dashed border-border" aria-hidden />
          )}
        </div>

        <div className="flex justify-center">
          {full ? (
            <Button variant="inverse" onClick={newRoll}>
              {t('newRoll')}
            </Button>
          ) : (
            <button
              type="button"
              onClick={shoot}
              disabled={!live || busy || glError}
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
        />
      )}
    </div>
  )
}
