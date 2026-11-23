'use client'

import { Badge, Button, RebateLabel, cn } from '@chainroll/ui'
import { Aperture, ArrowRight, ChevronLeft, ChevronRight, Eye, Gavel, Hand, Sparkles } from 'lucide-react'
import type { Route } from 'next'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { FilmPreview, type SampleSceneKind } from './film-preview'
import { FILM_STOCKS } from './stocks'
import { useStockName } from './use-stock-name'

const HERO_FRAMES: readonly {
  frame: string
  scene: SampleSceneKind
  span: string
  hash: string
  shutter: string
  offerKub: string
  postId: string
}[] = [
  {
    frame: '04A',
    scene: 'nature',
    span: 'row-span-2',
    hash: '0x9f4c…e81a',
    shutter: '1/250s · f/2.8',
    offerKub: '4.5 KUB',
    postId: 'p-101',
  },
  {
    frame: '05',
    scene: 'portrait',
    span: '',
    hash: '0x3b12…c09d',
    shutter: '1/125s · f/2.0',
    offerKub: '3.8 KUB',
    postId: 'p-102',
  },
  {
    frame: '05A',
    scene: 'night',
    span: '',
    hash: '0x7a8e…441f',
    shutter: '1/60s · f/1.4',
    offerKub: '7.5 KUB',
    postId: 'p-103',
  },
  {
    frame: '06',
    scene: 'indoor',
    span: 'col-span-2',
    hash: '0x5d20…92b4',
    shutter: '1/90s · f/2.0',
    offerKub: '5.2 KUB',
    postId: 'p-105',
  },
]

const STRIP_ITEMS: readonly {
  frame: string
  filmId: number
  scene: SampleSceneKind
  captionKey: 'chaophraya' | 'charoenkrung' | 'yaowarat' | 'songwat' | 'hualamphong' | 'chiangdao'
  kub: string
  postId: string
}[] = [
  { frame: '07A', filmId: 1, scene: 'nature', captionKey: 'chaophraya', kub: '4.5 KUB', postId: 'p-101' },
  { frame: '19A', filmId: 2, scene: 'portrait', captionKey: 'charoenkrung', kub: '3.8 KUB', postId: 'p-102' },
  { frame: '23A', filmId: 3, scene: 'night', captionKey: 'yaowarat', kub: '7.5 KUB', postId: 'p-103' },
  { frame: '04A', filmId: 1, scene: 'indoor', captionKey: 'songwat', kub: '2.4 KUB', postId: 'p-104' },
  { frame: '24A', filmId: 3, scene: 'night', captionKey: 'hualamphong', kub: '5.2 KUB', postId: 'p-105' },
  { frame: '12A', filmId: 2, scene: 'portrait', captionKey: 'chiangdao', kub: '3.1 KUB', postId: 'p-106' },
]

export function LandingInteractive() {
  const t = useTranslations('landing')
  const stockName = useStockName()

  const [stockId, setStockId] = useState<number>(1)
  const stock = FILM_STOCKS.find((s) => s.id === stockId) ?? FILM_STOCKS[0]!

  // Hold-to-develop state (0..100) — starts at 72% so the 35mm sample photography shines immediately
  const [holding, setHolding] = useState(false)
  const [progress, setProgress] = useState(72)
  const [hoveredIdx, setHoveredIdx] = useState<number>(0)
  const [tilt, setTilt] = useState<{ rx: number; ry: number; lx: number; ly: number }>({
    rx: 0,
    ry: 0,
    lx: 50,
    ly: 50,
  })
  const sheetRef = useRef<HTMLDivElement>(null)
  const sheetDragRef = useRef<{ startX: number; startProgress: number; dragged: boolean } | null>(null)

  // Film strip drag / hold scrub state (6 items * (176px + 12px gap) = 1128px)
  const STRIP_TRACK_W = 1128
  const [stripOffset, setStripOffset] = useState(0)
  const [stripHolding, setStripHolding] = useState(false)
  const [stripPaused, setStripPaused] = useState(false)
  const dragStartRef = useRef<{ x: number; offset: number } | null>(null)

  // Step hold state
  const [activeStep, setActiveStep] = useState<number | null>(null)

  // Smoothly advance developing progress only when user holds without dragging horizontally
  useEffect(() => {
    const id = window.setInterval(() => {
      setProgress((prev) => {
        if (holding && !sheetDragRef.current?.dragged) return Math.min(100, prev + 3.5)
        return prev
      })
    }, 30)
    return () => window.clearInterval(id)
  }, [holding])

  // Continuous film strip glide (pauses when hovering or dragging so user can inspect or scrub left/right)
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(50, now - last)
      last = now
      if (!stripHolding && !stripPaused) {
        const speed = holding ? 0.08 : 0.022
        setStripOffset((prev) => (prev + dt * speed) % STRIP_TRACK_W)
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [holding, stripHolding, stripPaused])

  const onSheetPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    setHolding(true)
    sheetDragRef.current = { startX: e.clientX, startProgress: progress, dragged: false }
  }

  const onSheetMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = sheetRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const nx = (e.clientX - rect.left) / rect.width
    const ny = (e.clientY - rect.top) / rect.height
    setTilt({
      rx: Number(((0.5 - ny) * 9).toFixed(2)),
      ry: Number(((nx - 0.5) * 11).toFixed(2)),
      lx: Math.round(nx * 100),
      ly: Math.round(ny * 100),
    })

    if (holding && sheetDragRef.current) {
      const dx = e.clientX - sheetDragRef.current.startX
      if (Math.abs(dx) > 6) {
        sheetDragRef.current.dragged = true
        const deltaPct = (dx / rect.width) * 100
        setProgress(Math.min(100, Math.max(0, Math.round(sheetDragRef.current.startProgress + deltaPct))))
      }
    }
  }

  const onSheetPointerUp = () => {
    setHolding(false)
    sheetDragRef.current = null
  }

  const onSheetLeave = () => {
    setHolding(false)
    sheetDragRef.current = null
    setTilt({ rx: 0, ry: 0, lx: 50, ly: 50 })
  }

  const stepStrip = (delta: number) => {
    setStripOffset((prev) => (((prev + delta) % STRIP_TRACK_W) + STRIP_TRACK_W) % STRIP_TRACK_W)
  }

  const activeFrame = HERO_FRAMES[hoveredIdx] ?? HERO_FRAMES[0]!
  // split position aligned 1:1 with the RAW..FILM slider (0% = full RAW, 100% = full FILM)
  const splitValue = Number((progress / 100).toFixed(2))

  const steps = ['load', 'shoot', 'develop', 'share'] as const

  return (
    <>
      {/* Hero — asymmetric, editorial, with hold-to-develop & 3D tilt */}
      <section className="grain mx-auto grid max-w-6xl gap-10 px-4 pt-8 pb-16 md:grid-cols-[1.12fr_1fr] md:px-8 md:pt-16 md:pb-20">
        <div className="flex flex-col justify-center gap-6">
          <div className="flex flex-wrap items-center gap-2.5">
            <RebateLabel>{t('rebate')}</RebateLabel>
            <Badge tone="frame" dot>
              {t('nftBadge')}
            </Badge>
          </div>

          <h1 className="font-display text-[clamp(42px,7.5vw,84px)] leading-[0.95] tracking-tight whitespace-pre-line">
            {t('headline')}
          </h1>

          <p className="max-w-md text-md text-fg-muted">{t('sub')}</p>

          {/* Interactive film stock selector pills */}
          <div className="flex flex-col gap-2">
            <span className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
              ▸ {t('tryFilmLabel')}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {FILM_STOCKS.map((s) => {
                const selected = s.id === stock.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStockId(s.id)}
                    className={cn(
                      'inline-flex h-8 items-center gap-2 rounded-xs border px-3 font-mono text-xs transition-all duration-[var(--dur-fast)]',
                      selected
                        ? 'border-frame bg-bg-sunken text-fg shadow-[inset_0_-2px_0_var(--frame)]'
                        : 'border-border bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg',
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-2.5 rounded-full"
                      style={{ background: s.swatch }}
                    />
                    <span>{stockName(s.id)}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Primary CTAs + Hold-to-develop button */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button variant="primary" size="lg" asChild>
              <Link href={`/camera?film=${stock.id}`}>
                {t('ctaCamera')}
                <ArrowRight />
              </Link>
            </Button>

            <button
              type="button"
              onPointerDown={() => setHolding(true)}
              onPointerUp={() => setHolding(false)}
              onPointerLeave={() => setHolding(false)}
              onClick={() => {
                if (progress >= 100) setProgress(20)
              }}
              className={cn(
                'relative inline-flex h-12 select-none items-center gap-2.5 overflow-hidden rounded-sm border px-5 text-sm font-medium transition-transform duration-[var(--dur-fast)] active:scale-[0.98]',
                holding
                  ? 'border-accent bg-bg-inverse text-fg-inverse'
                  : 'border-border-strong bg-bg-raised text-fg hover:bg-bg-sunken',
              )}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 bg-accent/20 transition-[width] duration-75"
                style={{ width: `${progress}%` }}
              />
              <Hand className={cn('relative size-4', holding ? 'text-frame' : 'text-accent')} />
              <span className="relative">
                {holding
                  ? t('holdingDevelop', { pct: Math.round(progress) })
                  : progress >= 100
                    ? t('developedReset')
                    : t('holdToDevelop')}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4 font-mono text-2xs uppercase tracking-wide text-fg-subtle">
            <span>{t('launch')}</span>
            <Link href="/feed" className="text-frame underline underline-offset-4 hover:text-fg">
              {t('explorePrints')} →
            </Link>
          </div>
        </div>

        {/* Interactive 3D Contact Sheet (responds to cursor move + press & hold) */}
        <div className="flex flex-col gap-2.5">
          <div
            ref={sheetRef}
            onPointerMove={onSheetMove}
            onPointerDown={onSheetPointerDown}
            onPointerUp={onSheetPointerUp}
            onPointerLeave={onSheetLeave}
            style={{
              transform: `perspective(1100px) rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(${holding ? 1.018 : 1})`,
              transition: holding
                ? 'transform 90ms ease-out, box-shadow 150ms ease-out'
                : 'transform 260ms ease-out, box-shadow 260ms ease-out',
            }}
            className={cn(
              'relative cursor-grab select-none bg-[#0e0c0b] p-3 pb-10 active:cursor-grabbing md:-mr-4',
              holding
                ? 'shadow-[0_20px_50px_rgba(210,58,30,0.28),0_0_0_1px_var(--accent)]'
                : 'shadow-[var(--elev-pop)]',
            )}
          >
            {/* Top film sprocket strip */}
            <div
              aria-hidden
              className="mb-2 h-2"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(90deg, transparent 0 7px, rgba(242,237,228,.18) 7px 15px, transparent 15px 22px)',
                backgroundPosition: `${-Math.round(progress * 1.6)}px center`,
              }}
            />

            {/* Developing progress bar + interactive Before/After slider */}
            <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 font-mono text-[10px] tracking-[0.16em] text-frame">
              <span className="min-w-0 flex-1 truncate">
                ▸ {stock.code} · ISO {stock.iso} ·{' '}
                {holding ? t('tankActive') : t('holdSheetHint')}
              </span>
              <span className="shrink-0 whitespace-nowrap tabular">{Math.round(progress)}% DEV</span>
            </div>

            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="mb-2.5 flex items-center gap-2 font-mono text-[10px] text-[#a39a90]"
            >
              <span className="shrink-0">{t('splitBefore')}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(progress)}
                onChange={(e) => setProgress(Number(e.target.value))}
                aria-label={t('splitSlider')}
                className="h-1.5 w-full cursor-ew-resize accent-[var(--frame)]"
              />
              <span className="shrink-0 text-frame">{t('splitAfter')}</span>
            </div>

            <div className="grid h-[360px] grid-cols-2 grid-rows-3 gap-2 sm:h-[440px]">
              {HERO_FRAMES.map((f, idx) => {
                const isFocused = hoveredIdx === idx
                return (
                  <figure
                    key={f.frame}
                    onPointerEnter={() => setHoveredIdx(idx)}
                    className={cn(
                      'group relative overflow-hidden border transition-colors',
                      f.span,
                      isFocused ? 'border-frame/80' : 'border-white/10',
                    )}
                  >
                    <FilmPreview
                      look={stock.look}
                      scene={f.scene}
                      split={splitValue < 1 ? splitValue : undefined}
                      splitSide="film-left"
                      className="size-full object-cover"
                    />

                    {/* Darkroom safelight veil that fades out as user holds to develop */}
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 bg-[#1a0906] transition-opacity duration-150"
                      style={{ opacity: Math.max(0, (100 - progress) / 145) }}
                    />

                    {/* Top-right 1/1 Print Offer chip */}
                    <Link
                      href={`/p/${f.postId}` as Route}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-xs border border-frame/50 bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-frame backdrop-blur-xs hover:bg-black"
                    >
                      <Gavel className="size-2.5" />
                      <span>1/1 · {f.offerKub}</span>
                    </Link>

                    <figcaption className="pointer-events-none absolute right-2 bottom-1.5 left-2 flex items-center justify-between font-mono text-[10px] tracking-[0.18em] text-frame">
                      <span className="bg-black/65 px-1">▸ {f.frame}</span>
                      <span className="bg-black/65 px-1 text-white/80">{f.shutter}</span>
                    </figcaption>
                  </figure>
                )
              })}
            </div>

            {/* Bottom Loupe inspection readout */}
            <div className="absolute right-3 bottom-2 left-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 font-mono text-[10px] tracking-[0.14em] text-frame/85">
              <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                <Eye className="size-3 shrink-0 text-accent" />
                <span className="truncate">
                  FRAME {activeFrame.frame} · {activeFrame.hash}
                </span>
              </span>
              <span className="shrink-0">1/1 OFFER {activeFrame.offerKub}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Draggable / Hold-to-Scrub 35mm Film Strip Ribbon */}
      <section
        aria-label={t('stripLabel')}
        onMouseEnter={() => setStripPaused(true)}
        onMouseLeave={() => {
          setStripPaused(false)
          setStripHolding(false)
          dragStartRef.current = null
        }}
        onPointerDown={(e) => {
          setStripHolding(true)
          dragStartRef.current = { x: e.clientX, offset: stripOffset }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!stripHolding || !dragStartRef.current) return
          const dx = dragStartRef.current.x - e.clientX
          setStripOffset((((dragStartRef.current.offset + dx) % STRIP_TRACK_W) + STRIP_TRACK_W) % STRIP_TRACK_W)
        }}
        onPointerUp={() => {
          setStripHolding(false)
          dragStartRef.current = null
        }}
        onWheel={(e) => {
          if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
            e.preventDefault()
            stepStrip(e.deltaX || e.deltaY)
          }
        }}
        className="relative cursor-grab select-none overflow-hidden border-y border-border bg-[#0b0908] py-3 active:cursor-grabbing"
      >
        {/* Left / Right Manual Scrub Buttons */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => stepStrip(-220)}
          aria-label={t('stripPrev')}
          className="absolute top-1/2 left-2 z-20 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/80 text-[#f2ede4] shadow-md backdrop-blur-xs transition-colors hover:border-frame hover:text-frame"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => stepStrip(220)}
          aria-label={t('stripNext')}
          className="absolute top-1/2 right-2 z-20 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/80 text-[#f2ede4] shadow-md backdrop-blur-xs transition-colors hover:border-frame hover:text-frame"
        >
          <ChevronRight className="size-5" />
        </button>
        <div
          aria-hidden
          className="mb-2 h-2"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent 0 8px, rgba(242,237,228,.16) 8px 16px, transparent 16px 24px)',
            backgroundPosition: `${-Math.round(stripOffset)}px center`,
          }}
        />

        <div
          className="flex gap-3 px-4"
          style={{
            transform: `translate3d(${-Math.round(stripOffset)}px, 0, 0)`,
            width: 'max-content',
          }}
        >
          {[...STRIP_ITEMS, ...STRIP_ITEMS].map((item, i) => {
            const itemStock = FILM_STOCKS.find((s) => s.id === item.filmId) ?? FILM_STOCKS[0]!
            return (
              <div
                key={`${item.frame}-${i}`}
                className="flex w-44 shrink-0 flex-col gap-1.5 border border-white/10 bg-[#14110f] p-2 transition-colors hover:border-frame/60"
              >
                <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.18em] text-frame">
                  <span>▸ {item.frame}</span>
                  <span>{itemStock.code}</span>
                </div>
                <div className="relative aspect-[3/2] w-full overflow-hidden border border-white/10 bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element -- static sample thumb avoids 12 extra WebGL2 contexts */}
                  <img
                    src={`/samples/${item.scene}.jpg`}
                    alt=""
                    draggable={false}
                    className={cn(
                      'pointer-events-none size-full object-cover',
                      item.filmId === 2 && 'grayscale contrast-125',
                      item.filmId === 3 && 'contrast-115 saturate-115',
                    )}
                  />
                </div>
                <p className="truncate text-xs text-[#f2ede4]">
                  {t(`stripCaptions.${item.captionKey}`)}
                </p>
                <div className="flex items-center justify-between border-t border-white/10 pt-1 font-mono text-[10px]">
                  <span className="inline-flex items-center gap-1 text-frame">
                    <Sparkles className="size-2.5" />
                    1/1 · {item.kub}
                  </span>
                  <Link
                    href={`/p/${item.postId}` as Route}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="text-white/70 underline hover:text-white"
                  >
                    {t('stripBid')}
                  </Link>
                </div>
              </div>
            )
          })}
        </div>

        <div
          aria-hidden
          className="mt-2 h-2"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent 0 8px, rgba(242,237,228,.16) 8px 16px, transparent 16px 24px)',
            backgroundPosition: `${-Math.round(stripOffset)}px center`,
          }}
        />
      </section>

      {/* Interactive 4-Step Strip (responds to hover & press/hold) */}
      <section className="border-b border-border bg-bg-raised">
        <div className="mx-auto max-w-6xl px-4 py-14 md:px-8">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display text-2xl">{t('stepsTitle')}</h2>
            <span className="font-mono text-2xs text-fg-subtle">{t('stepsHint')}</span>
          </div>

          <ol className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => {
              const isHeld = activeStep === i
              return (
                <li
                  key={s}
                  onPointerEnter={() => setActiveStep(i)}
                  onPointerDown={() => setActiveStep(i)}
                  onPointerLeave={() => setActiveStep(null)}
                  className={cn(
                    'group relative flex cursor-pointer select-none flex-col justify-between gap-4 bg-bg-raised p-5 transition-colors duration-[var(--dur-fast)]',
                    isHeld && 'bg-bg-sunken shadow-[inset_0_2px_0_var(--accent)]',
                  )}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-2xs tracking-[0.18em] text-frame">
                        ▸ 0{i + 1}
                      </span>
                      <span
                        className={cn(
                          'font-mono text-2xs transition-colors',
                          isHeld ? 'text-accent' : 'text-fg-subtle',
                        )}
                      >
                        {i === 0 && (isHeld ? '24 / 24 EXP READY' : '00:00 UTC+7')}
                        {i === 1 && (isHeld ? 'keccak256 ✓' : '~55k gas')}
                        {i === 2 && (isHeld ? 'DEVELOPING 100%' : '60 MIN TANK')}
                        {i === 3 && (isHeld ? '1/1 NFT · 5% ROYALTY' : 'ERC-721 + OFFERS')}
                      </span>
                    </div>
                    <span className="text-md font-medium text-fg">{t(`steps.${s}.title`)}</span>
                    <span className="text-sm text-fg-muted">{t(`steps.${s}.body`)}</span>
                  </div>

                  {/* Kinetic micro-meter at bottom of each step card */}
                  <div className="h-1 w-full overflow-hidden bg-bg">
                    <div
                      className={cn(
                        'h-full transition-all duration-300',
                        isHeld ? 'w-full bg-accent' : 'w-1/4 bg-border-strong',
                      )}
                    />
                  </div>
                </li>
              )
            })}
          </ol>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-fg-subtle">{t('privacy')}</p>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/feed">
                <Aperture />
                {t('explorePrints')}
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
