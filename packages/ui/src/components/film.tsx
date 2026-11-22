'use client'

import { Check, Copy, ExternalLink } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useState } from 'react'
import { cn } from '../lib/cn'

/* ── FrameCounter ─────────────────────────────────────────── */

export type FrameCounterProps = { used: number; total: number; className?: string }

/** `07 / 24` — frames used on the current roll */
export function FrameCounter({ used, total, className }: FrameCounterProps) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const left = total - used
  return (
    <span
      role="status"
      aria-label={`ถ่ายไปแล้ว ${used} จาก ${total} รูป`}
      className={cn('inline-flex items-baseline gap-1 font-mono tabular text-frame', className)}
    >
      <span className="text-lg">{pad(used)}</span>
      <span className="text-xs opacity-60">/ {pad(total)}</span>
      {left <= 3 && left > 0 && (
        <span className="ml-2 text-2xs uppercase tracking-wider">เหลือ {left}</span>
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
        aria-label={copied ? 'คัดลอกแล้ว' : 'คัดลอก hash'}
        className="rounded-xs p-1 text-fg-subtle hover:bg-bg-sunken hover:text-fg [&_svg]:size-3.5"
      >
        {copied ? <Check /> : <Copy />}
      </button>
      {explorerUrl && (
        <a
          href={`${explorerUrl}${hash}`}
          target="_blank"
          rel="noreferrer"
          aria-label="ดูบน explorer"
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
export function FilmStrip({
  className,
  label = 'กำลังโหลด',
}: {
  className?: string
  label?: string
}) {
  const perforation = 'repeating-linear-gradient(90deg, var(--bg) 0 6px, transparent 6px 12px)'
  const advance = 'film-advance 600ms linear infinite'
  return (
    <div role="progressbar" aria-label={label} className={cn('w-40', className)}>
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
