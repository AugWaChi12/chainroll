'use client'

import { Check, Copy, ExternalLink } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useState } from 'react'
import { fmt, useUiLabels } from '../i18n'
import { cn } from '../lib/cn'

/* ── FrameCounter ─────────────────────────────────────────── */

export type FrameCounterProps = { used: number; total: number; className?: string }

/** `07 / 24` — frames used on the current roll */
export function FrameCounter({ used, total, className }: FrameCounterProps) {
  const L = useUiLabels()
  const pad = (n: number) => String(n).padStart(2, '0')
  const left = total - used
  return (
    <span
      role="status"
      aria-label={fmt(L.framesShot, { used, total })}
      className={cn('inline-flex items-baseline gap-1 font-mono tabular text-frame', className)}
    >
      <span className="text-lg">{pad(used)}</span>
      <span className="text-xs opacity-60">/ {pad(total)}</span>
      {left <= 3 && left > 0 && (
        <span className="ml-2 text-2xs uppercase tracking-wider">
          {fmt(L.framesLeft, { left })}
        </span>
      )}
    </span>
  )
}

/* ── RebateLabel ──────────────────────────────────────────── */

/** Film-edge marking: `▸ 07A` */
export function RebateLabel({ className, children, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn('font-mono text-2xs uppercase tracking-[0.18em] text-frame tabular', className)}
      {...props}
    >
      ▸ {children}
    </span>
  )
}

/* ── TxHash ───────────────────────────────────────────────── */

export type TxHashProps = {
  hash: string
  /** Explorer base, e.g. https://www.bkcscan.com/tx/ */
  explorerUrl?: string
  className?: string
}

export function truncateHash(hash: string, head = 6, tail = 4) {
  return hash.length <= head + tail + 1 ? hash : `${hash.slice(0, head)}…${hash.slice(-tail)}`
}

export function TxHash({ hash, explorerUrl, className }: TxHashProps) {
  const L = useUiLabels()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hash)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard may be blocked — ignore */
    }
  }
  return (
    <span
      className={cn('inline-flex items-center gap-1 font-mono text-xs text-fg-muted', className)}
    >
      <span title={hash}>{truncateHash(hash)}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? L.copied : L.copyHash}
        className="rounded-xs p-1 text-fg-subtle hover:bg-bg-sunken hover:text-fg [&_svg]:size-3.5"
      >
        {copied ? <Check /> : <Copy />}
      </button>
      {explorerUrl && (
        <a
          href={`${explorerUrl}${hash}`}
          target="_blank"
          rel="noreferrer"
          aria-label={L.viewOnExplorer}
          className="rounded-xs p-1 text-fg-subtle hover:bg-bg-sunken hover:text-fg [&_svg]:size-3.5"
        >
          <ExternalLink />
        </a>
      )}
    </span>
  )
}

/* ── FilmStrip (loader) ───────────────────────────────────── */

/** Loading indicator for waits > 1s — an advancing strip of film, not a spinner. */
export function FilmStrip({ className, label }: { className?: string; label?: string }) {
  const L = useUiLabels()
  const perforation = 'repeating-linear-gradient(90deg, var(--bg) 0 6px, transparent 6px 12px)'
  const advance = 'film-advance 600ms linear infinite'
  return (
    <div role="progressbar" aria-label={label ?? L.loading} className={cn('w-40', className)}>
      <div className="flex h-7 flex-col justify-between bg-bg-inverse py-[3px]">
        <div
          className="h-[3px]"
          style={{ backgroundImage: perforation, backgroundSize: '12px 3px', animation: advance }}
        />
        <div
          className="mx-1 h-[11px]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, color-mix(in oklab, var(--frame) 55%, transparent) 0 40px, transparent 40px 48px)',
            animation: advance,
          }}
        />
        <div
          className="h-[3px]"
          style={{ backgroundImage: perforation, backgroundSize: '12px 3px', animation: advance }}
        />
      </div>
    </div>
  )
}

/* ── LatentFrame ──────────────────────────────────────────── */

export type LatentFrameProps = {
  frame: number
  /** on-chain state of this frame */
  status?: 'pending' | 'confirmed' | 'failed'
  className?: string
  /** show the big frame number (contact sheets) or keep it tiny (thumbnails) */
  size?: 'sm' | 'lg'
}

/**
 * An exposed-but-undeveloped frame: you know it's there, you can't see it yet.
 * Used everywhere a photo would appear before its roll is developed (PROJECT_BRIEF §7, decision 1).
 */
export function LatentFrame({ frame, status, className, size = 'sm' }: LatentFrameProps) {
  const L = useUiLabels()
  const n = String(frame).padStart(2, '0')
  return (
    <div
      role="img"
      aria-label={fmt(L.latentFrame, { frame: n })}
      className={cn(
        'relative overflow-hidden bg-[#120f0d]',
        "before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_at_30%_20%,rgba(210,58,30,0.10),transparent_60%)] before:content-['']",
        className,
      )}
    >
      <span
        className={cn(
          'absolute inset-0 grid place-items-center font-mono tabular text-frame/35',
          size === 'lg' ? 'text-2xl' : 'text-[10px]',
        )}
      >
        {n}
      </span>
      {status && (
        <span
          aria-hidden
          className={cn(
            'absolute top-1 left-1 size-1.5 rounded-full',
            status === 'pending' && 'animate-pulse bg-warning',
            status === 'confirmed' && 'bg-success',
            status === 'failed' && 'bg-danger',
          )}
        />
      )}
    </div>
  )
}
