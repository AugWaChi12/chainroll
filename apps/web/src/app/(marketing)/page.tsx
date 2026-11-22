import { Button, RebateLabel } from '@chainroll/ui'
import { Aperture, ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

/* Placeholder frames — painted tones instead of stock photos, so nothing looks borrowed. */
const FRAMES = [
  {
    n: '04A',
    tone: 'linear-gradient(160deg,#e9b47a 0%,#b8643a 45%,#3a1f17 100%)',
    span: 'row-span-2',
  },
  { n: '05', tone: 'linear-gradient(200deg,#cfd6cf 0%,#7d8a84 55%,#2b302e 100%)', span: '' },
  { n: '05A', tone: 'linear-gradient(140deg,#2a2622 0%,#5c4a3d 40%,#d9a066 100%)', span: '' },
  {
    n: '06',
    tone: 'linear-gradient(180deg,#f2ede4 0%,#a39a90 60%,#1a1714 100%)',
    span: 'col-span-2',
  },
]

export default function LandingPage() {
  const t = useTranslations('landing')
  const steps = ['load', 'shoot', 'develop', 'share'] as const

  return (
    <div className="min-h-dvh">
      {/* top bar */}
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-2 font-display text-xl">
          <Aperture className="size-5 text-accent" aria-hidden />
          ChainRoll
        </Link>
        <nav className="flex items-center gap-1">
          {(['films', 'how', 'darkroom'] as const).map((k) => (
            <Button key={k} variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
              <Link href={k === 'how' ? '/how-it-works' : `/${k}`}>{t(`nav.${k}`)}</Link>
            </Button>
          ))}
          <Button variant="inverse" size="sm" asChild>
            <Link href="/camera">{t('ctaCamera')}</Link>
          </Button>
        </nav>
      </header>

      {/* hero — asymmetric, editorial */}
      <section className="grain mx-auto grid max-w-6xl gap-12 px-4 pt-10 pb-20 md:grid-cols-[1.15fr_1fr] md:px-8 md:pt-20">
        <div className="flex flex-col justify-center gap-7">
          <RebateLabel>{t('rebate')}</RebateLabel>
          <h1 className="font-display text-[clamp(44px,8vw,88px)] leading-[0.95] tracking-tight whitespace-pre-line">
            {t('headline')}
          </h1>
          <p className="max-w-md text-md text-fg-muted">{t('sub')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" asChild>
              <Link href="/camera">
                {t('ctaCamera')}
                <ArrowRight />
              </Link>
            </Button>
            <Button variant="ghost" size="lg" asChild>
              <Link href="/films">{t('ctaFilms')}</Link>
            </Button>
          </div>
          <p className="font-mono text-2xs uppercase tracking-wide text-fg-subtle">{t('launch')}</p>
        </div>

        {/* contact sheet */}
        <div className="relative bg-bg-inverse p-3 pb-8 md:-mr-8 md:rotate-[1.2deg]">
          <div className="grid h-[420px] grid-cols-2 grid-rows-3 gap-2">
            {FRAMES.map((f) => (
              <figure key={f.n} className={`relative ${f.span}`}>
                <div className="absolute inset-0" style={{ background: f.tone }} />
                <figcaption className="absolute bottom-1.5 left-2 font-mono text-[10px] tracking-[0.2em] text-frame">
                  ▸ {f.n}
                </figcaption>
              </figure>
            ))}
          </div>
          <span className="absolute right-3 bottom-2 font-mono text-[10px] tracking-[0.2em] text-frame/70">
            KUB 400 · 0x3f…a91c
          </span>
        </div>
      </section>

      {/* steps — a strip of four frames */}
      <section className="border-y border-border bg-bg-raised">
        <div className="mx-auto max-w-6xl px-4 py-14 md:px-8">
          <h2 className="mb-8 font-display text-2xl">{t('stepsTitle')}</h2>
          <ol className="grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s} className="flex flex-col gap-2 bg-bg-raised p-5">
                <span className="font-mono text-2xs tracking-[0.18em] text-frame">▸ 0{i + 1}</span>
                <span className="text-md font-medium">{t(`steps.${s}.title`)}</span>
                <span className="text-sm text-fg-muted">{t(`steps.${s}.body`)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xs text-fg-subtle">{t('privacy')}</p>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl items-center justify-between px-4 py-8 font-mono text-2xs text-fg-subtle md:px-8">
        <span>ChainRoll · KUB Chain</span>
        <nav className="flex gap-4">
          <Link href="/how-it-works" className="hover:text-fg">
            {t('nav.how')}
          </Link>
          <Link href="/privacy" className="hover:text-fg">
            {t('nav.privacy')}
          </Link>
        </nav>
        <span className="hidden sm:inline">{t('footerTag')}</span>
      </footer>
    </div>
  )
}
