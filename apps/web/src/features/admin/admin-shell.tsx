'use client'

import { LocaleSwitcher } from '@/features/i18n'
import { ConnectSheet, WalletButton, activeChain, chainRollContract, useWallet } from '@/features/wallet'
import { chainRollAbi } from '@chainroll/contracts'
import { AppShell, Badge, Button, Kbd, RebateLabel, cn, type NavSection } from '@chainroll/ui'
import {
  Aperture,
  Eye,
  FileClock,
  Film,
  Flag,
  Fuel,
  LayoutDashboard,
  Rows3,
  Rows4,
  ScrollText,
  Search,
  ShieldAlert,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import type { Route } from 'next'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { keccak256, stringToHex, zeroAddress, type Hex } from 'viem'
import { useReadContracts } from 'wagmi'
import { useAdminStore } from './audit-store'

const DENSITY_KEY = 'chainroll.admin.density'
const DEFAULT_ADMIN_ROLE: Hex =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
const CURATOR_ROLE: Hex = keccak256(stringToHex('CURATOR_ROLE'))

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations('admin')
  const pathname = usePathname()
  const router = useRouter()
  const { address } = useWallet()
  const { moderation } = useAdminStore()
  const pendingReports = moderation.filter((m) => m.status === 'pending').length

  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable')
  const [connectOpen, setConnectOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [previewBypass, setPreviewBypass] = useState(true)

  const roleCheck = useReadContracts({
    contracts: [
      {
        address: chainRollContract!,
        abi: chainRollAbi,
        chainId: activeChain.id,
        functionName: 'hasRole',
        args: [DEFAULT_ADMIN_ROLE, address ?? zeroAddress],
      },
      {
        address: chainRollContract!,
        abi: chainRollAbi,
        chainId: activeChain.id,
        functionName: 'hasRole',
        args: [CURATOR_ROLE, address ?? zeroAddress],
      },
    ],
    query: { enabled: Boolean(chainRollContract && address) },
  })

  const hasOnChainRole = Boolean(
    address && (roleCheck.data?.[0]?.result || roleCheck.data?.[1]?.result),
  )

  useEffect(() => {
    const saved = window.localStorage.getItem(DENSITY_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate preference from localStorage
    if (saved === 'compact' || saved === 'comfortable') setDensity(saved)
  }, [])

  const toggleDensity = () => {
    const next = density === 'comfortable' ? 'compact' : 'comfortable'
    setDensity(next)
    window.localStorage.setItem(DENSITY_KEY, next)
  }

  const item = (
    href: string,
    key: string,
    icon: NavSection['items'][number]['icon'],
    count?: number,
  ) => ({
    href,
    label: t(`nav.${key}`),
    icon,
    count,
    active: href === '/admin' ? pathname === '/admin' : pathname.startsWith(href),
  })

  const sections: NavSection[] = [
    {
      title: t('nav.monitor'),
      items: [
        item('/admin', 'overview', LayoutDashboard),
        item('/admin/moderation', 'moderation', Flag, pendingReports),
      ],
    },
    {
      title: t('nav.content'),
      items: [item('/admin/films', 'films', Film), item('/admin/users', 'users', Users)],
    },
    {
      title: t('nav.system'),
      items: [
        item('/admin/gas', 'gas', Fuel),
        item('/admin/contract', 'contract', ScrollText),
        item('/admin/audit', 'audit', FileClock),
      ],
    },
  ]

  const commands = useMemo(
    () => [
      { id: 'overview', label: t('nav.overview'), hint: '01', href: '/admin' },
      { id: 'moderation', label: t('nav.moderation'), hint: '02', href: '/admin/moderation' },
      { id: 'films', label: t('nav.films'), hint: '03', href: '/admin/films' },
      { id: 'users', label: t('nav.users'), hint: '04', href: '/admin/users' },
      { id: 'gas', label: t('nav.gas'), hint: '05', href: '/admin/gas' },
      { id: 'contract', label: t('nav.contract'), hint: '06', href: '/admin/contract' },
      { id: 'audit', label: t('nav.audit'), hint: '07', href: '/admin/audit' },
      { id: 'camera', label: t('cmd.openCamera'), hint: '/camera', href: '/camera' },
      { id: 'darkroom', label: t('cmd.openDarkroom'), hint: '/darkroom', href: '/darkroom' },
    ],
    [t],
  )

  const matchedCommands = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.id.includes(q) || c.hint.toLowerCase().includes(q),
    )
  }, [commands, query])

  const go = (href: string) => {
    setCmdOpen(false)
    setQuery('')
    router.push(href as Route)
  }

  return (
    <div data-density={density}>
      <AppShell
        brand={
          <Link href="/" className="flex items-center gap-2">
            <Aperture className="size-4 text-accent" aria-hidden />
            <span className="text-sm font-semibold tracking-tight">{t('console')}</span>
          </Link>
        }
        sections={sections}
        renderLink={({ href, children, ...rest }) => (
          <Link href={href as Route} {...rest}>
            {children}
          </Link>
        )}
        onSearch={() => {
          setQuery('')
          setCursor(0)
          setCmdOpen(true)
        }}
        searchLabel={t('search')}
        topbarRight={
          <>
            <button
              type="button"
              onClick={toggleDensity}
              title={t(`density.${density}`)}
              aria-label={t(`density.${density}`)}
              className="hidden h-8 items-center gap-1.5 rounded-xs border border-border px-2 font-mono text-2xs text-fg-muted hover:border-border-strong hover:text-fg sm:inline-flex"
            >
              {density === 'compact' ? <Rows4 className="size-3.5" /> : <Rows3 className="size-3.5" />}
              <span>{t(`density.${density}`)}</span>
            </button>
            <LocaleSwitcher />
            <Badge
              tone={activeChain.id === 96 ? 'success' : 'warning'}
              dot
              className="hidden md:inline-flex"
            >
              {activeChain.name}
            </Badge>
            <WalletButton onOpen={() => setConnectOpen(true)} />
          </>
        }
        sidebarFooter={<span className="font-mono text-2xs text-fg-subtle">v0.5 · M5</span>}
      >
        {!hasOnChainRole && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/40 bg-bg-sunken px-4 py-2 text-xs md:px-8">
            <div className="flex items-center gap-2 text-fg-muted">
              <ShieldAlert className="size-3.5 shrink-0 text-warning" />
              <span>{address ? t('guard.readOnlyWallet') : t('guard.readOnlyGuest')}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewBypass((v) => !v)}
                className="font-mono text-2xs text-frame underline underline-offset-4 hover:text-fg"
              >
                {previewBypass ? t('guard.testGateBtn') : t('guard.enterPreviewBtn')}
              </button>
            </div>
          </div>
        )}

        {!hasOnChainRole && !previewBypass ? (
          <div className="mx-auto max-w-2xl px-4 py-16 md:px-8">
            <div className="flex flex-col items-start gap-4 border border-danger/40 bg-bg-raised p-6 shadow-[inset_2px_0_0_var(--danger)]">
              <RebateLabel>403 · {t('guard.eyebrow')}</RebateLabel>
              <h1 className="font-display text-2xl text-fg">{t('guard.title')}</h1>
              <p className="text-sm text-fg-muted">{t('guard.body')}</p>
              <dl className="w-full border border-border bg-bg p-3 font-mono text-xs">
                <div className="flex flex-wrap justify-between gap-2 py-1">
                  <dt className="text-fg-subtle">{t('guard.requiredRole')}</dt>
                  <dd className="text-frame">DEFAULT_ADMIN_ROLE · CURATOR_ROLE</dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-t border-border py-1">
                  <dt className="text-fg-subtle">{t('guard.currentWallet')}</dt>
                  <dd className="text-fg">{address ?? t('guard.notConnected')}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                {!address && (
                  <Button variant="primary" size="sm" onClick={() => setConnectOpen(true)}>
                    <Wallet />
                    {t('guard.connectBtn')}
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => setPreviewBypass(true)}>
                  <Eye />
                  {t('guard.enterPreviewBtn')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          children
        )}
      </AppShell>
      <ConnectSheet open={connectOpen} onClose={() => setConnectOpen(false)} />

      {cmdOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('search')}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-20"
          onClick={() => setCmdOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-md border border-border-strong bg-bg-raised shadow-[var(--elev-pop)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-11 items-center gap-2 border-b border-border px-3">
              <Search className="size-4 text-fg-subtle" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setCursor(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault()
                    setCmdOpen(false)
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setCursor((c) => Math.min(matchedCommands.length - 1, c + 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setCursor((c) => Math.max(0, c - 1))
                  } else if (e.key === 'Enter' && matchedCommands[cursor]) {
                    e.preventDefault()
                    go(matchedCommands[cursor]!.href)
                  }
                }}
                placeholder={t('search')}
                className="h-full flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
              />
              <button
                type="button"
                aria-label={t('cmd.close')}
                onClick={() => setCmdOpen(false)}
                className="rounded-xs p-1 text-fg-subtle hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto p-1.5">
              {matchedCommands.map((cmd, idx) => (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => go(cmd.href)}
                  onMouseEnter={() => setCursor(idx)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-xs px-3 py-2 text-left text-sm',
                    idx === cursor ? 'bg-bg-sunken text-fg' : 'text-fg-muted hover:text-fg',
                  )}
                >
                  <span>{cmd.label}</span>
                  <span className="font-mono text-2xs text-frame">▸ {cmd.hint}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-2xs text-fg-subtle">
              <span className="inline-flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> {t('cmd.navigate')}
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>↵</Kbd> {t('cmd.open')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
