'use client'

import { LocaleSwitcher } from '@/features/i18n'
import { ConnectSheet, WalletButton, useWallet } from '@/features/wallet'
import { cn } from '@chainroll/ui'
import {
  Aperture,
  BookOpen,
  Film,
  History,
  LayoutGrid,
  Menu,
  ShieldCheck,
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
  const [online, setOnline] = useState(true)
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

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

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-4 md:gap-6 md:px-8">
          <Link href="/" className="flex shrink-0 items-center gap-1.5 font-display text-lg sm:gap-2 sm:text-xl">
            <Aperture className="size-5 text-accent" aria-hidden />
            ChainRoll
          </Link>
          <nav aria-label={t('label')} className="hidden items-center gap-1 md:flex">
            {[...LEFT, ...RIGHT].map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active(i.href) ? 'page' : undefined}
                className={cn(
                  'relative rounded-xs px-3 py-1.5 text-sm transition-colors',
                  active(i.href) ? 'text-fg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {t(i.key)}
                {active(i.href) && (
                  <span aria-hidden className="absolute inset-x-3 -bottom-[13px] h-0.5 bg-accent" />
                )}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <Link
              href="/camera"
              className="hidden h-8 items-center gap-2 rounded-sm bg-accent px-3 text-xs font-medium text-accent-fg hover:bg-accent-hover md:flex"
            >
              <Aperture className="size-4" aria-hidden />
              {t('camera')}
            </Link>
            <Link
              href="/verify"
              title={t('verify')}
              aria-label={t('verify')}
              className={cn(
                'hidden size-8 items-center justify-center rounded-xs border transition-colors md:inline-flex',
                active('/verify')
                  ? 'border-border-strong bg-bg-sunken text-fg'
                  : 'border-border bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg',
              )}
            >
              <ShieldCheck className="size-4" />
            </Link>
            <Link
              href="/activity"
              title={t('activity')}
              aria-label={t('activity')}
              className={cn(
                'hidden size-8 items-center justify-center rounded-xs border transition-colors md:inline-flex',
                active('/activity')
                  ? 'border-border-strong bg-bg-sunken text-fg'
                  : 'border-border bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg',
              )}
            >
              <History className="size-4" />
            </Link>
            {address && (
              <Link
                href={`/u/${address}` as Route}
                title={t('profile')}
                aria-label={t('profile')}
                className={cn(
                  'hidden size-8 items-center justify-center rounded-xs border transition-colors md:inline-flex',
                  active('/u')
                    ? 'border-border-strong bg-bg-sunken text-fg'
                    : 'border-border bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg',
                )}
              >
                <User className="size-4" />
              </Link>
            )}
            <div className="hidden md:block">
              <LocaleSwitcher />
            </div>
            <WalletButton onOpen={() => setConnectOpen(true)} />
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={t('label')}
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-xs border transition-colors md:hidden',
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
                href="/verify"
                onClick={() => setMenuOpen(false)}
                className={cn(
                  'flex items-center gap-2.5 rounded-xs px-2.5 py-2 text-sm',
                  active('/verify') ? 'bg-bg-sunken text-fg' : 'text-fg-muted hover:bg-bg-sunken/60',
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
                  active('/activity') ? 'bg-bg-sunken text-fg' : 'text-fg-muted hover:bg-bg-sunken/60',
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
