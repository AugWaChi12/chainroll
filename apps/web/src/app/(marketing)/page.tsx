import { LandingInteractive } from '@/features/film'
import { LocaleSwitcher } from '@/features/i18n'
import { Button } from '@chainroll/ui'
import { Aperture } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

export default function LandingPage() {
  const t = useTranslations('landing')

  return (
    <div className="min-h-dvh overflow-x-clip">
      {/* top bar */}
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:px-4 md:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-1.5 font-display text-lg sm:gap-2 sm:text-xl">
          <Aperture className="size-5 text-accent" aria-hidden />
          ChainRoll
        </Link>
        <nav className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
            <Link href="/feed">{t('nav.feed')}</Link>
          </Button>
          {(['films', 'how', 'darkroom'] as const).map((k) => (
            <Button key={k} variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
              <Link href={k === 'how' ? '/how-it-works' : `/${k}`}>{t(`nav.${k}`)}</Link>
            </Button>
          ))}
          <LocaleSwitcher className="mx-1" />
          <Button variant="inverse" size="sm" asChild>
            <Link href="/camera">{t('ctaCamera')}</Link>
          </Button>
        </nav>
      </header>

      <LandingInteractive />

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-8 font-mono text-2xs text-fg-subtle md:px-8">
        <span>ChainRoll · KUB Chain</span>
        <nav className="flex gap-4">
          <Link href="/feed" className="hover:text-fg">
            {t('nav.feed')}
          </Link>
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
