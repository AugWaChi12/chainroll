'use client'

import { Button, cn } from '@chainroll/ui'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  FlaskConical,
  LogOut,
  QrCode,
  ShieldCheck,
  Smartphone,
  User,
  Wallet,
  Warehouse,
  X,
} from 'lucide-react'
import type { Route } from 'next'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import QRCode from 'qrcode'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { activeChain } from './chain'
import { classifyTxError } from './tx'
import { useWallet, type WalletOption } from './wallet-provider'

/**
 * Connect sheet (PROJECT_BRIEF §5.1): Bitkub NEXT first, then whatever wallets the browser
 * announces (EIP-6963), then WalletConnect with our own QR — no third-party modal.
 */
export function ConnectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('wallet')
  const w = useWallet()
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Auto-close sheet as soon as wallet connects (e.g., returning from KUB Wallet mobile app)
  useEffect(() => {
    if (open && w.address) onClose()
  }, [open, w.address, onClose])

  if (!open) return null

  const go = async (o: WalletOption) => {
    setError(null)
    setPendingId(o.id)
    try {
      await w.connect(o.id)
      onClose()
    } catch (e) {
      const { code } = classifyTxError(e)
      // closing the QR / wallet popup is a normal "cancel", not an error worth shouting about
      if (code !== 'rejected') setError(t(`errors.${code}`))
    } finally {
      setPendingId(null)
    }
  }

  const byKind = (k: WalletOption['kind']) => w.options.filter((o) => o.kind === k)
  const browser = byKind('injected').filter((o) => o.available)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div aria-hidden className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-title"
        className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto border-t border-border bg-bg-raised p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-fg shadow-pop sm:border"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <span className="font-mono text-2xs tracking-wide text-frame">▸ {t('eyebrow')}</span>
            <h2 id="connect-title" className="font-display text-2xl">
              {t('title')}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{t('subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="rounded-xs p-1.5 text-fg-muted hover:text-fg"
          >
            <X className="size-5" />
          </button>
        </div>

        {w.wcUri ? (
          <QrPanel uri={w.wcUri} onBack={onClose} />
        ) : (
          <div className="flex flex-col gap-5">
            <Section title={t('sections.recommended')}>
              {byKind('bitkub-next').map((o) => (
                <Row
                  key={o.id}
                  option={o}
                  busy={pendingId === o.id}
                  disabled={w.connecting}
                  onClick={() => go(o)}
                  mark={
                    <span className="grid size-9 place-items-center rounded-xs bg-[#00c26f] font-mono text-xs font-semibold text-black">
                      BK
                    </span>
                  }
                  body={o.available ? t('next.body') : t('next.unavailable')}
                  tag={t('tags.login')}
                />
              ))}
            </Section>

            <Section title={t('sections.browser')}>
              {browser.length > 0 ? (
                browser.map((o) => (
                  <Row
                    key={o.id}
                    option={o}
                    busy={pendingId === o.id}
                    disabled={w.connecting}
                    onClick={() => go(o)}
                    mark={<WalletIcon icon={o.icon} />}
                    body={o.available ? t('injected.detected') : t('injected.missing')}
                    tag={t('tags.extension')}
                  />
                ))
              ) : (
                <a
                  href="https://metamask.io/download"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 border border-dashed border-border px-3 py-3 text-sm text-fg-muted hover:border-fg-muted hover:text-fg"
                >
                  <WalletIcon />
                  {t('injected.install')}
                </a>
              )}
            </Section>

            <Section title={t('sections.mobile')}>
              {byKind('walletconnect').map((o) => (
                <Row
                  key={o.id}
                  option={o}
                  busy={pendingId === o.id}
                  disabled={w.connecting}
                  onClick={() => go(o)}
                  mark={
                    <span className="grid size-9 place-items-center rounded-xs bg-[#3b99fc] text-white">
                      <QrCode className="size-4" />
                    </span>
                  }
                  body={o.available ? t('wc.body') : t('wc.unavailable')}
                  tag={t('tags.qr')}
                />
              ))}
            </Section>

            {byKind('dev').length > 0 && (
              <Section title={t('sections.dev')}>
                {byKind('dev').map((o) => (
                  <Row
                    key={o.id}
                    option={o}
                    busy={pendingId === o.id}
                    disabled={w.connecting}
                    onClick={() => go(o)}
                    mark={
                      <span className="grid size-9 place-items-center rounded-xs border border-dashed border-frame text-frame">
                        <FlaskConical className="size-4" />
                      </span>
                    }
                    title={t('dev.title')}
                    body={t('dev.body')}
                    tag="anvil"
                  />
                ))}
              </Section>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
        <p className="mt-5 text-2xs text-fg-subtle">{t('privacy')}</p>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="font-mono text-2xs tracking-wide text-fg-subtle">{title}</h3>
      <ul className="flex flex-col gap-1.5">{children}</ul>
    </section>
  )
}

function Row({
  option,
  mark,
  title,
  body,
  tag,
  busy,
  disabled,
  onClick,
}: {
  option: WalletOption
  mark: ReactNode
  title?: string
  body: string
  tag: string
  busy: boolean
  disabled: boolean
  onClick: () => void
}) {
  const t = useTranslations('wallet')
  return (
    <li>
      <button
        type="button"
        disabled={!option.available || disabled}
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-3 border border-border bg-bg px-3 py-2.5 text-left transition-colors',
          'hover:border-fg-muted disabled:cursor-not-allowed disabled:opacity-50',
          busy && 'border-frame',
        )}
      >
        {mark}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{title ?? option.name}</span>
          <span className="truncate text-xs text-fg-muted">{busy ? t('connecting') : body}</span>
        </span>
        <span className="shrink-0 font-mono text-2xs text-fg-subtle">{tag}</span>
      </button>
    </li>
  )
}

function WalletIcon({ icon }: { icon?: string }) {
  if (icon)
    // eslint-disable-next-line @next/next/no-img-element -- data: URI announced by the wallet
    return <img src={icon} alt="" className="size-9 rounded-xs object-contain p-1" />
  return (
    <span className="grid size-9 place-items-center rounded-xs border border-border">
      <Wallet className="size-4" />
    </span>
  )
}

/** Our own WalletConnect pairing view: QR on desktop, "open in wallet" deep link on phones. */
function QrPanel({ uri, onBack }: { uri: string; onBack: () => void }) {
  const t = useTranslations('wallet.wc')
  const [src, setSrc] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    void QRCode.toDataURL(uri, {
      margin: 1,
      width: 560,
      errorCorrectionLevel: 'M',
      color: { dark: '#1a1714', light: '#f7f4ee' },
    }).then((d) => alive && setSrc(d))
    return () => {
      alive = false
    }
  }, [uri])

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="self-start text-sm text-fg-muted">{t('scan')}</p>
      <div className="relative w-full max-w-72 border border-border bg-[#f7f4ee] p-3">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated data: URI
          <img src={src} alt={t('qrAlt')} className="aspect-square w-full" />
        ) : (
          <div className="aspect-square w-full animate-pulse bg-[#e6dfd2]" />
        )}
        <span className="absolute -bottom-5 left-0 font-mono text-[10px] tracking-[0.2em] text-frame">
          ▸ WC 2.0
        </span>
      </div>
      <div className="mt-3 flex w-full flex-wrap justify-center gap-2">
        <Button size="sm" variant="primary" asChild>
          <a href={`kubwallet://wc?uri=${encodeURIComponent(uri)}`}>
            <Smartphone />
            {t('openKubWallet')}
          </a>
        </Button>
        <Button size="sm" variant="secondary" asChild>
          <a href={uri}>
            <Smartphone />
            {t('openApp')}
          </a>
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(uri)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              /* clipboard blocked */
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? t('copied') : t('copy')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onBack}>
          <ArrowLeft />
          {t('cancel')}
        </Button>
      </div>
    </div>
  )
}

/** Small pill showing the connected wallet + account dropdown; opens ConnectSheet when disconnected. */
export function WalletButton({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations('wallet')
  const w = useWallet()
  const [menuOpen, setMenuOpen] = useState(false)
  const [copiedAddr, setCopiedAddr] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target?.closest('[data-wallet-menu]')) setMenuOpen(false)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [menuOpen])

  if (!w.address)
    return (
      <Button size="sm" variant="secondary" onClick={onOpen}>
        <Wallet />
        {t('connect')}
      </Button>
    )

  const explorerBase =
    activeChain.blockExplorers?.default.url ?? 'https://testnet.kubscan.com'

  return (
    <div className="relative flex shrink-0 items-center" data-wallet-menu>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-expanded={menuOpen}
        className={cn(
          'flex h-8 shrink-0 items-center gap-2 rounded-sm border px-2.5 font-mono text-[11px] whitespace-nowrap transition-colors sm:text-2xs',
          menuOpen
            ? 'border-border-strong bg-bg-sunken text-fg'
            : 'border-border bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg',
        )}
      >
        <span
          aria-hidden
          title={w.authenticated ? t('verifiedSiwe') : t('verifyWallet')}
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            w.authenticated ? 'bg-success' : 'bg-frame',
          )}
        />
        <span>
          {w.address.slice(0, 6)}…{w.address.slice(-4)}
        </span>
        <ChevronDown
          className={cn(
            'size-3 text-fg-subtle transition-transform duration-150',
            menuOpen && 'rotate-180 text-frame',
          )}
          aria-hidden
        />
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-10 z-50 w-68 overflow-hidden rounded-sm border border-border bg-bg-raised shadow-pop">
          <div className="border-b border-border bg-bg-sunken/60 px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] tracking-widest text-frame uppercase">
                ▸ {w.walletName || 'KUB WALLET'}
              </span>
              {w.authenticated ? (
                <span className="inline-flex items-center gap-1 rounded-xs border border-success/40 bg-success/10 px-1.5 py-0.5 font-mono text-[10px] text-success">
                  <ShieldCheck className="size-3" />
                  {t('verifiedSiwe')}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={w.authenticating}
                  onClick={() => void w.signIn()}
                  className="inline-flex items-center gap-1 rounded-xs border border-frame/60 bg-frame/15 px-1.5 py-0.5 font-mono text-[10px] text-frame hover:bg-frame/25"
                >
                  <ShieldCheck className="size-3" />
                  {w.authenticating ? t('verifying') : t('verifyWallet')}
                </button>
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-fg">
                {w.address.slice(0, 10)}…{w.address.slice(-8)}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title={t('copyAddress')}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(w.address!)
                      setCopiedAddr(true)
                      setTimeout(() => setCopiedAddr(false), 1500)
                    } catch {
                      /* clipboard blocked */
                    }
                  }}
                  className="inline-flex size-6 items-center justify-center rounded-xs border border-border bg-bg text-fg-muted hover:border-border-strong hover:text-fg"
                >
                  {copiedAddr ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                </button>
                <a
                  href={`${explorerBase}/address/${w.address}`}
                  target="_blank"
                  rel="noreferrer"
                  title={t('viewExplorer')}
                  className="inline-flex size-6 items-center justify-center rounded-xs border border-border bg-bg text-fg-muted hover:border-border-strong hover:text-fg"
                >
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          </div>

          <div className="divide-y divide-border/50 p-1.5">
            <Link
              href={`/u/${w.address}` as Route}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-xs px-2.5 py-2 text-sm text-fg transition-colors hover:bg-bg-sunken"
            >
              <User className="size-4 text-frame" />
              <span>{t('myProfile')}</span>
            </Link>
            <Link
              href="/darkroom"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 rounded-xs px-2.5 py-2 text-sm text-fg transition-colors hover:bg-bg-sunken"
            >
              <Warehouse className="size-4 text-frame" />
              <span>{t('myDarkroom')}</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                void w.disconnect()
              }}
              className="flex w-full items-center gap-2.5 rounded-xs px-2.5 py-2 text-left text-sm text-danger transition-colors hover:bg-danger/10"
            >
              <LogOut className="size-4" />
              <span>{t('disconnect')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
