'use client'

import { Button, RebateLabel } from '@chainroll/ui'
import { Aperture } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { FilmPreview } from './film-preview'
import { FILM_STOCKS } from './stocks'

export function FilmsCatalog() {
  const t = useTranslations('films')
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-16 md:px-8">
      <header className="mb-10 flex flex-col gap-1.5">
        <span className="font-mono text-2xs tracking-wide text-frame">▸ {t('eyebrow')}</span>
        <h1 className="font-display text-3xl leading-none md:text-4xl">{t('title')}</h1>
        <p className="max-w-xl text-sm text-fg-muted">{t('subtitle')}</p>
      </header>

      <ul className="grid gap-x-6 gap-y-12 md:grid-cols-3">
        {FILM_STOCKS.map((s, i) => (
          <li key={s.id} className={i === 1 ? 'md:mt-16' : undefined}>
            <article className="flex flex-col gap-4">
              {/* the frame, as it would come out of the developer */}
              <div className="bg-[#0e0c0b] p-2 pb-6">
                <FilmPreview look={s.look} className="aspect-[2/3] w-full" />
                <div className="mt-1.5 flex justify-between font-mono text-[10px] tracking-[0.2em] text-frame/80">
                  <span>▸ {String(i + 1).padStart(2, '0')}A</span>
                  <span>{s.code}</span>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-2xl">{s.name}</h2>
                  <RebateLabel>
                    ISO {s.iso} · {s.frames} EXP
                  </RebateLabel>
                </div>
                <p className="text-sm text-fg-muted">{t(`stocks.${s.id}.body`)}</p>
                <dl className="mt-1 grid grid-cols-3 gap-px border border-border bg-border font-mono text-2xs">
                  {(['grain', 'contrast', 'glow'] as const).map((k) => (
                    <div key={k} className="flex flex-col gap-1 bg-bg p-2">
                      <dt className="text-fg-subtle">{t(`traits.${k}`)}</dt>
                      <dd>
                        <Meter
                          value={
                            k === 'grain'
                              ? s.look.grain
                              : k === 'contrast'
                                ? s.look.contrast
                                : s.look.halation
                          }
                        />
                      </dd>
                    </div>
                  ))}
                </dl>
                <Button className="mt-2 self-start" asChild>
                  <Link href={`/camera?film=${s.id}`}>
                    <Aperture />
                    {t('use')}
                  </Link>
                </Button>
              </div>
            </article>
          </li>
        ))}
      </ul>
      <p className="mt-12 text-2xs text-fg-subtle">{t('note')}</p>
    </div>
  )
}

/** Five-segment meter — reads like the exposure scale on an old camera. */
function Meter({ value }: { value: number }) {
  const on = Math.max(1, Math.round(Math.min(1, value / 0.65) * 5))
  return (
    <span className="flex gap-0.5" aria-label={`${on}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < on ? 'h-2 w-3 bg-frame' : 'h-2 w-3 bg-bg-sunken'} />
      ))}
    </span>
  )
}
