'use client'

import { Button, RebateLabel, cn } from '@chainroll/ui'
import { ArrowRight } from 'lucide-react'
import type { Route } from 'next'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'
import { FilmPreview, type SampleSceneKind } from './film-preview'
import { FILM_STOCKS } from './stocks'
import { useStockName } from './use-stock-name'

const SHOWCASE_FRAMES: readonly {
  frame: string
  filmId: number
  scene: SampleSceneKind
  captionKey: 'chaophraya' | 'charoenkrung' | 'yaowarat' | 'songwat'
  postId: string
}[] = [
  { frame: '07A', filmId: 1, scene: 'nature', captionKey: 'chaophraya', postId: 'p-101' },
  { frame: '19A', filmId: 2, scene: 'portrait', captionKey: 'charoenkrung', postId: 'p-102' },
  { frame: '23A', filmId: 3, scene: 'night', captionKey: 'yaowarat', postId: 'p-103' },
  { frame: '04A', filmId: 1, scene: 'indoor', captionKey: 'songwat', postId: 'p-104' },
]

export function LandingInteractive() {
  const t = useTranslations('landing')
  const stockName = useStockName()

  const [stockId, setStockId] = useState<number>(1)
  const [sceneIdx, setSceneIdx] = useState<number>(0)
  const [splitPct, setSplitPct] = useState<number>(100)

  const stock = FILM_STOCKS.find((s) => s.id === stockId) ?? FILM_STOCKS[0]!
  const activeFrame = SHOWCASE_FRAMES[sceneIdx] ?? SHOWCASE_FRAMES[0]!
  const splitValue = splitPct < 100 ? Number((splitPct / 100).toFixed(2)) : undefined
  const steps = ['load', 'shoot', 'develop', 'share'] as const

  return (
    <>
      {/* Clean editorial hero — single iconic 35mm frame, generous whitespace */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-16 md:grid-cols-[1.1fr_0.9fr] md:gap-16 md:px-8 md:pt-20 md:pb-24">
        <div className="flex flex-col gap-7">
          <RebateLabel>{t('rebate')}</RebateLabel>

          <h1 className="font-display text-[clamp(40px,6.8vw,76px)] leading-[0.98] tracking-tight whitespace-pre-line text-fg">
            {t('headline')}
          </h1>

          <p className="max-w-md text-base leading-relaxed text-fg-muted">{t('sub')}</p>

          {/* Primary + secondary CTA */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button variant="primary" size="lg" asChild>
              <Link href={`/camera?film=${stock.id}`}>
                {t('ctaCamera')}
                <ArrowRight />
              </Link>
            </Button>
            <Button variant="secondary" size="lg" asChild>
              <Link href="/feed">{t('explorePrints')}</Link>
            </Button>
          </div>

          {/* Quiet film stock switcher */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            {FILM_STOCKS.map((s) => {
              const selected = s.id === stock.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStockId(s.id)}
                  className={cn(
                    'inline-flex h-8 items-center gap-2 rounded-xs border px-3 font-mono text-xs transition-colors',
                    selected
                      ? 'border-border-strong bg-bg-sunken text-fg'
                      : 'border-transparent text-fg-muted hover:border-border hover:text-fg',
                  )}
                >
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: s.swatch }}
                  />
                  <span>{stockName(s.id)}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Single clean 35mm darkroom frame preview */}
        <div className="mx-auto w-full max-w-[420px] md:mr-0">
          <div className="bg-[#0e0c0b] p-3 pb-3.5 shadow-[var(--elev-pop)]">
            <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
              <FilmPreview
                look={stock.look}
                scene={activeFrame.scene}
                split={splitValue}
                splitSide="film-left"
                className="size-full object-cover"
              />
            </div>

            {/* Minimal RAW ↔ FILM comparison slider */}
            <div className="mt-3 flex items-center gap-2.5 font-mono text-[10px] tracking-wider text-[#a39a90]">
              <span className="shrink-0">{t('splitBefore')}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={splitPct}
                onChange={(e) => setSplitPct(Number(e.target.value))}
                aria-label={t('splitSlider')}
                className="h-1 w-full cursor-ew-resize accent-[var(--frame)]"
              />
              <span className="shrink-0 text-frame">{t('splitAfter')}</span>
            </div>

            {/* Clean rebate footer + 4 scene dots */}
            <div className="mt-2.5 flex items-center justify-between font-mono text-[10px] tracking-[0.16em] text-frame/90">
              <span>
                ▸ {activeFrame.frame} · {stock.code}
              </span>
              <div className="flex items-center gap-1.5">
                {SHOWCASE_FRAMES.map((f, idx) => (
                  <button
                    key={f.frame}
                    type="button"
                    aria-label={t(`stripCaptions.${f.captionKey}`)}
                    onClick={() => setSceneIdx(idx)}
                    className={cn(
                      'size-2 rounded-full transition-colors',
                      idx === sceneIdx ? 'bg-frame' : 'bg-white/25 hover:bg-white/50',
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Calm 4-frame curated gallery strip */}
      <section aria-label={t('stripLabel')} className="border-y border-border bg-bg-raised/60">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
          <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-4">
            {SHOWCASE_FRAMES.map((item) => {
              const itemStock = FILM_STOCKS.find((s) => s.id === item.filmId) ?? FILM_STOCKS[0]!
              return (
                <Link
                  key={item.frame}
                  href={`/p/${item.postId}` as Route}
                  className="group flex flex-col gap-2.5"
                >
                  <div className="aspect-[3/4] w-full overflow-hidden bg-[#0e0c0b] p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/samples/${item.scene}.jpg`}
                      alt={t(`stripCaptions.${item.captionKey}`)}
                      className={cn(
                        'size-full object-cover transition-transform duration-[var(--dur-slow)] group-hover:scale-[1.02]',
                        item.filmId === 2 && 'grayscale contrast-125',
                        item.filmId === 3 && 'contrast-110 saturate-110',
                      )}
                    />
                  </div>
                  <div className="flex items-center justify-between font-mono text-[10px] tracking-wider text-fg-subtle">
                    <span className="text-frame">▸ {item.frame}</span>
                    <span>{itemStock.code}</span>
                  </div>
                  <p className="line-clamp-1 text-xs text-fg-muted group-hover:text-fg">
                    {t(`stripCaptions.${item.captionKey}`)}
                  </p>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* Quiet 4-step editorial workflow */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-20">
        <h2 className="mb-10 font-display text-2xl text-fg">{t('stepsTitle')}</h2>

        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s} className="flex flex-col gap-2.5 border-t border-border pt-4">
              <span className="font-mono text-2xs tracking-[0.18em] text-frame">▸ 0{i + 1}</span>
              <span className="text-base font-medium text-fg">{t(`steps.${s}.title`)}</span>
              <span className="text-sm leading-relaxed text-fg-muted">{t(`steps.${s}.body`)}</span>
            </li>
          ))}
        </ol>

        <p className="mt-12 border-t border-border pt-6 font-mono text-2xs text-fg-subtle">
          {t('privacy')}
        </p>
      </section>
    </>
  )
}
