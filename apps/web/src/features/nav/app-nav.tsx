'use client'

import { LocaleSwitcher } from '@/features/i18n'
import { ThemeToggle } from '@/components/theme-toggle'
import { ConnectSheet, WalletButton, useWallet } from '@/features/wallet'
import { cn } from '@chainroll/ui'
import {
  Aperture,
  BookOpen,
  ChevronDown,
  Film,
  History,
  LayoutGrid,
  Menu,
  ShieldCheck,
  Trophy,
  User,
  Warehouse,
  WifiOff,
  X,
} from 'lucide-react'
import type { Route } from 'next'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type ComponentType, type ReactNode } from 'react'

type Item = { href: Route; key: string; icon: ComponentType<{ className?: string }> }

const LEFT: Item[] = [
  { href: '/feed', key: 'feed', icon: LayoutGrid },
  { href: '/films', key: 'films', icon: Film },
]
const RIGHT: Item[] = [
  { href: '/darkroom', key: 'darkroom', icon: Warehouse },
  { href: '/how-it-works', key: 'how', icon: BookOpen },
]

/**
 * Studio-mode chrome for every user page except the camera (PROJECT_BRIEF §7):
 * top bar on desktop, bottom tab bar with a big center shutter on phones.
 */
export function AppNav({ children }: { children: ReactNode }) {
  const t = useTranslations('nav')
  const pathname = usePathname()
  const { address } = useWallet()
  const [connectOpen, setConnectOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [online, setOnline] = useState(true)
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

  useEffect(() => {
    if (!moreOpen) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest('[data-more-menu]')) setMoreOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [moreOpen])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read initial browser online state
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    const onUp = () => setOnline(true)
    const onDown = () => setOnline(false)
    window.addEventListener('online', onUp)
    window.addEventListener('offline', onDown)
    return () => {
      window.removeEventListener('online', onUp)
      window.removeEventListener('offline', onDown)
    }
  }, [])

  const isExploreRoute =
    active('/leaderboard') || active('/verify') || active('/activity') || active('/how-it-works')

  const exploreItems: {
    href: Route
    mark: string
    title: string
    sub: string
    icon: ComponentType<{ className?: string }>
  }[] = [
    {
      href: '/leaderboard',
      mark: '01A',
      title: t('leaderboard'),
      sub: t('leaderboardSub'),
      icon: Trophy,
    },
    {
      href: '/verify',
      mark: '02A',
      title: t('verify'),
      sub: t('verifySub'),
      icon: ShieldCheck,
    },
    {
      href: '/activity',
      mark: '03A',
      title: t('activity'),
      sub: t('activitySub'),
      icon: History,
    },
    {
      href: '/how-it-works',
      mark: '04A',
      title: t('how'),
      sub: t('howSub'),
      icon: BookOpen,
    },
    ...(address
      ? [
          {
            href: `/u/${address}` as Route,
            mark: '05A',
            title: t('profile'),
            sub: t('profileSub'),
            icon: User,
          },
        ]
      : []),
  ]

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-bg/92 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-3 sm:px-5 md:px-8">
          {/* Left: Brand + Primary Navigation */}
          <div className="flex items-center gap-3 lg:gap-5">
            <Link
              href="/"
              className="group flex shrink-0 items-center gap-2 font-display text-lg tracking-tight sm:text-xl"
            >
              <span className="grid size-7 place-items-center rounded-xs border border-accent/40 bg-accent/10 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-fg">
                <Aperture className="size-4" aria-hidden />
              </span>
              <span>ChainRoll</span>
            </Link>

            <span aria-hidden className="hidden h-4 w-px bg-border md:block" />

            <nav
              aria-label={t('label')}
              className="hidden shrink-0 items-center gap-0.5 md:flex lg:gap-1"
            >
              {[
                { href: '/feed' as Route, label: t('feed') },
                { href: '/films' as Route, label: t('films') },
                { href: '/darkroom' as Route, label: t('darkroom') },
              ].map((item) => {
                const isActive = active(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'relative shrink-0 rounded-xs px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors lg:px-3',
                      isActive ? 'text-fg' : 'text-fg-muted hover:bg-bg-sunken/60 hover:text-fg',
                    )}
                  >
                    {item.label}
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute inset-x-2.5 -bottom-[11px] h-0.5 bg-accent lg:inset-x-3"
                      />
                    )}
                  </Link>
                )
              })}

              {/* Direct Leaderboard & Verify links on spacious xl screens */}
              <Link
                href="/leaderboard"
                aria-current={active('/leaderboard') ? 'page' : undefined}
                className={cn(
                  'relative hidden shrink-0 rounded-xs px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors xl:inline-flex',
                  active('/leaderboard')
                    ? 'text-fg'
                    : 'text-fg-muted hover:bg-bg-sunken/60 hover:text-fg',
                )}
              >
                {t('leaderboard')}
                {active('/leaderboard') && (
                  <span
                    aria-hidden
                    className="absolute inset-x-2.5 -bottom-[11px] h-0.5 bg-accent"
                  />
                )}
              </Link>

              <Link
                href="/verify"
                aria-current={active('/verify') ? 'page' : undefined}
                className={cn(
                  'relative hidden shrink-0 rounded-xs px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors xl:inline-flex',
                  active('/verify')
                    ? 'text-fg'
                    : 'text-fg-muted hover:bg-bg-sunken/60 hover:text-fg',
                )}
              >
                {t('verifyShort')}
                {active('/verify') && (
                  <span
                    aria-hidden
                    className="absolute inset-x-2.5 -bottom-[11px] h-0.5 bg-accent"
                  />
                )}
              </Link>

              {/* Explore Studio Directory Dropdown */}
              <div className="relative" data-more-menu>
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                  className={cn(
                    'relative inline-flex items-center gap-1 rounded-xs px-2.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors',
                    moreOpen || isExploreRoute
                      ? 'bg-bg-sunken/80 text-fg'
                      : 'text-fg-muted hover:bg-bg-sunken/60 hover:text-fg',
                  )}
                >
                  <span>{t('explore')}</span>
                  <ChevronDown
                    className={cn(
                      'size-3.5 text-fg-subtle transition-transform duration-150',
                      moreOpen && 'rotate-180 text-frame',
                    )}
                    aria-hidden
                  />
                  {isExploreRoute && !moreOpen && (
                    <span
                      aria-hidden
                      className="absolute inset-x-2.5 -bottom-[11px] h-0.5 bg-accent xl:hidden"
                    />
                  )}
                </button>

                {moreOpen && (
                  <div className="absolute left-0 top-11 z-40 w-80 overflow-hidden rounded-sm border border-border bg-bg-raised shadow-pop">
                    <div className="flex items-center justify-between border-b border-border bg-bg-sunken/60 px-3.5 py-2">
                      <span className="font-mono text-[10px] tracking-widest text-frame uppercase">
                        ▸ {t('directoryEyebrow')}
                      </span>
                      <span className="font-mono text-[10px] text-fg-subtle">KUB · 35MM</span>
                    </div>
                    <div className="divide-y divide-border/50 p-1.5">
                      {exploreItems.map((item) => {
                        const Icon = item.icon
                        const itemActive = active(item.href)
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMoreOpen(false)}
                            className={cn(
                              'group flex items-start gap-3 rounded-xs px-2.5 py-2.5 transition-colors',
                              itemActive ? 'bg-bg-sunken text-fg' : 'hover:bg-bg-sunken/70',
                            )}
                          >
                            <span
                              className={cn(
                                'mt-0.5 grid size-8 shrink-0 place-items-center rounded-xs border transition-colors',
                                itemActive
                                  ? 'border-frame/60 bg-frame/15 text-frame'
                                  : 'border-border bg-bg text-fg-muted group-hover:border-frame/50 group-hover:text-frame',
                              )}
                            >
                              <Icon className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium text-fg">
                                  {item.title}
                                </span>
                                <span className="font-mono text-[10px] text-frame/80">
                                  {item.mark}
                                </span>
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-fg-muted">
                                {item.sub}
                              </span>
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </nav>
          </div>

          {/* Right: Camera CTA + Studio Controls + Account Wallet */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              href="/camera"
              className="hidden h-8 items-center gap-1.5 rounded-sm bg-accent px-3 text-xs font-medium text-accent-fg shadow-xs transition-colors hover:bg-accent-hover md:inline-flex"
            >
              <Aperture className="size-3.5" aria-hidden />
              <span>{t('camera')}</span>
            </Link>

            <span aria-hidden className="hidden h-4 w-px bg-border md:block" />

            <div className="hidden items-center gap-1.5 md:flex">
              <ThemeToggle />
              <LocaleSwitcher />
            </div>

            <WalletButton onOpen={() => setConnectOpen(true)} />

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={t('label')}
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-sm border transition-colors md:hidden',
                menuOpen
                  ? 'border-border-strong bg-bg-sunken text-fg'
                  : 'border-border bg-bg-raised text-fg-muted hover:text-fg',
              )}
            >
              {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>

        {/* Compact mobile overflow menu */}
        {menuOpen && (
          <div className="border-t border-border bg-bg-raised px-4 py-3 md:hidden">
            <div className="flex flex-col gap-1.5">
              <Link
                href="/leaderboard"
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 rounded-xs px-2.5 py-2 text-sm',
                  active('/leaderboard')
                    ? 'bg-bg-sunken text-fg'
                    : 'text-fg-muted hover:bg-bg-sunken/60',
                )}
              >
                <Trophy className="size-4 text-frame" />
                <span>{t('leaderboard')}</span>
              </Link>
              <Link
                href="/verify"
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 rounded-xs px-2.5 py-2 text-sm',
                  active('/verify')
                    ? 'bg-bg-sunken text-fg'
                    : 'text-fg-muted hover:bg-bg-sunken/60',
                )}
              >
                <ShieldCheck className="size-4 text-frame" />
                <span>{t('verify')}</span>
              </Link>
              <Link
                href="/activity"
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 rounded-xs px-2.5 py-2 text-sm',
                  active('/activity')
                    ? 'bg-bg-sunken text-fg'
                    : 'text-fg-muted hover:bg-bg-sunken/60',
                )}
              >
                <History className="size-4 text-frame" />
                <span>{t('activity')}</span>
              </Link>
              {address && (
                <Link
                  href={`/u/${address}` as Route}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xs px-2.5 py-2 text-sm',
                    active('/u') ? 'bg-bg-sunken text-fg' : 'text-fg-muted hover:bg-bg-sunken/60',
                  )}
                >
                  <User className="size-4 text-frame" />
                  <span>{t('profile')}</span>
                </Link>
              )}
              <div className="mt-1 flex items-center justify-between border-t border-border pt-2.5">
                <span className="font-mono text-2xs text-fg-subtle">Theme</span>
                <ThemeToggle />
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-border pt-2.5">
                <span className="font-mono text-2xs text-fg-subtle">Language / ภาษา</span>
                <LocaleSwitcher />
              </div>
            </div>
          </div>
        )}
        {!online && (
          <div
            role="status"
            className="flex items-center justify-center gap-2 border-t border-warning/40 bg-bg-sunken px-4 py-1.5 text-2xs text-warning"
          >
            <WifiOff className="size-3.5" aria-hidden />
            <span>{t('offline')}</span>
          </div>
        )}
      </header>

      <main className="flex-1 pb-24 md:pb-0">{children}</main>

      {/* bottom tab bar (phones) */}
      <nav
        aria-label={t('label')}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm md:hidden"
      >
        <div className="grid h-16 grid-cols-5 items-center">
          {LEFT.map((i) => (
            <Tab key={i.href} item={i} label={t(i.key)} active={active(i.href)} />
          ))}
          <div className="flex justify-center">
            <Link
              href="/camera"
              aria-label={t('camera')}
              className="-mt-7 grid size-16 place-items-center rounded-full border-4 border-bg bg-accent text-accent-fg shadow-pop transition-transform active:scale-95"
            >
              <Aperture className="size-7" />
            </Link>
          </div>
          {RIGHT.map((i) => (
            <Tab key={i.href} item={i} label={t(i.key)} active={active(i.href)} />
          ))}
        </div>
      </nav>

      <ConnectSheet open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  )
}

function Tab({ item, label, active }: { item: Item; label: string; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex flex-col items-center gap-1 text-[11px]',
        active ? 'text-fg' : 'text-fg-subtle',
      )}
    >
      <Icon className={cn('size-5', active && 'text-accent')} />
      {label}
    </Link>
  )
}
