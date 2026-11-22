'use client'

import { Button, cn } from '@deekub/ui'
import { FlaskConical, Wallet, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'
import type { WalletKind } from './adapter'
import { classifyTxError } from './tx'
import { useWallet } from './wallet-provider'

/** Bottom sheet: Bitkub NEXT first (most Thai users already have it), then browser wallets. */
export function ConnectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('wallet')
  const w = useWallet()
  const [error, setError] = useState<string | null>(null)
  const firstRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    firstRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const go = async (kind: WalletKind) => {
    setError(null)
    try {
      await w.connect(kind)
      onClose()
    } catch (e) {
      const { code } = classifyTxError(e)
      setError(t(`errors.${code}`))
    }
  }

  const options: {
    kind: WalletKind
    title: string
    body: string
    enabled: boolean
    note?: string
    mark: React.ReactNode
  }[] = [
    {
      kind: 'bitkub-next',
      title: 'Bitkub NEXT',
      body: t('next.body'),
      enabled: w.available.bitkubNext,
      note: w.available.bitkubNext ? undefined : t('next.unavailable'),
      mark: (
        <span className="grid size-9 place-items-center rounded-xs bg-[#00c26f] font-mono text-xs font-semibold text-black">
          BK
        </span>
      ),
    },
    {
      kind: 'injected',
      title: t('injected.title'),
      body: t('injected.body'),
      enabled: w.available.injected,
      note: w.available.injected ? undefined : t('injected.missing'),
      mark: (
        <span className="grid size-9 place-items-center rounded-xs border border-border">
          <Wallet className="size-4" />
        </span>
      ),
    },
    ...(w.available.dev
      ? [
          {
            kind: 'dev' as const,
            title: t('dev.title'),
            body: t('dev.body'),
            enabled: true,
            mark: (
              <span className="grid size-9 place-items-center rounded-xs border border-dashed border-frame text-frame">
                <FlaskConical className="size-4" />
              </span>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div aria-hidden className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-title"
        className="relative w-full max-w-md border-t border-border bg-bg-raised p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-fg shadow-pop sm:border"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
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

        <ul className="flex flex-col gap-2">
          {options.map((o, i) => (
            <li key={o.kind}>
              <button
                ref={i === 0 ? firstRef : undefined}
                type="button"
                disabled={!o.enabled || w.connecting}
                onClick={() => go(o.kind)}
                className={cn(
                  'flex w-full items-center gap-3 border border-border bg-bg px-3 py-3 text-left transition-colors',
                  'hover:border-fg-muted disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {o.mark}
                <span className="flex flex-1 flex-col">
                  <span className="text-sm font-medium">{o.title}</span>
                  <span className="text-xs text-fg-muted">{o.note ?? o.body}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        {w.connecting && <p className="mt-3 text-xs text-fg-muted">{t('connecting')}</p>}
        <p className="mt-4 text-2xs text-fg-subtle">{t('privacy')}</p>
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
    <button
      type="button"
      onClick={() => void w.disconnect()}
      title={t('disconnect')}
      className="flex items-center gap-1.5 rounded-xs border border-border px-2 py-1 font-mono text-2xs text-fg-muted hover:text-fg"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-success" />
      {w.kind === 'bitkub-next' ? 'NEXT' : w.kind === 'dev' ? 'DEV' : 'EVM'} ·{' '}
      {w.address.slice(0, 6)}…{w.address.slice(-4)}
    </button>
  )
}
