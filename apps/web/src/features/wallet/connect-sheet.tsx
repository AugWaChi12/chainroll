'use client'

import { Button, cn } from '@chainroll/ui'
import {
  ArrowLeft,
  Check,
  Copy,
  FlaskConical,
  QrCode,
  ShieldCheck,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import QRCode from 'qrcode'
import { useEffect, useRef, useState, type ReactNode } from 'react'
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

/** Small pill showing the connected wallet; opens the sheet when disconnected. */
export function WalletButton({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations('wallet')
  const w = useWallet()
  if (!w.address)
    return (
      <Button size="sm" variant="secondary" onClick={onOpen}>
        <Wallet />
        {t('connect')}
      </Button>
    )
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {!w.authenticated && (
        <button
          type="button"
          disabled={w.authenticating}
          onClick={() => void w.signIn()}
          title={t('verifyWallet')}
          className="inline-flex h-7 items-center gap-1 rounded-xs border border-frame/70 bg-frame/15 px-1.5 font-mono text-[11px] whitespace-nowrap text-frame transition-colors hover:bg-frame/25 disabled:opacity-50 sm:h-8 sm:px-2 sm:text-2xs"
        >
          <ShieldCheck className="size-3.5 shrink-0 sm:size-3" />
          <span className="hidden sm:inline">
            {w.authenticating ? t('verifying') : t('verifyWallet')}
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={() => void w.disconnect()}
        title={t('disconnect')}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-xs border border-border px-2 font-mono text-[11px] whitespace-nowrap text-fg-muted hover:text-fg sm:h-8 sm:text-2xs"
      >
        <span
          aria-hidden
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            w.authenticated ? 'bg-success' : 'bg-warning',
          )}
        />
        <span className="hidden max-w-24 truncate xl:inline">{w.walletName}</span>
        <span className="hidden xl:inline">·</span>
        <span className="sm:hidden">
          {w.address.slice(0, 4)}…{w.address.slice(-4)}
        </span>
        <span className="hidden sm:inline">
          {w.address.slice(0, 6)}…{w.address.slice(-4)}
        </span>
      </button>
    </div>
  )
}
