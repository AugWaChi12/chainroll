import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

export type KPIStatProps = {
  label: string
  value: string
  /** Relative change, e.g. 0.124 = +12.4% */
  delta?: number
  /** Is a rising number good? (false for e.g. failed tx, open reports) */
  higherIsBetter?: boolean
  hint?: string
  /** Last N values for the sparkline */
  trend?: number[]
  tone?: 'default' | 'danger'
  className?: string
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const w = 96
  const h = 28
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values
    .map(
      (v, i) =>
        `${((i / (values.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`,
    )
    .join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="text-fg-subtle">
      <polyline
        points={pts}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function KPIStat({
  label,
  value,
  delta,
  higherIsBetter = true,
  hint,
  trend,
  tone = 'default',
  className,
}: KPIStatProps) {
  const good = delta === undefined ? undefined : delta >= 0 === higherIsBetter
  return (
    <div
      className={cn(
        'flex flex-col gap-3 bg-bg-raised p-4',
        tone === 'danger' && 'shadow-[inset_2px_0_0_var(--danger)]',
        className,
      )}
    >
      <span className="text-xs text-fg-muted">{label}</span>
      <div className="flex items-end justify-between gap-3">
        <span className="font-mono text-2xl tracking-tight tabular text-fg">{value}</span>
        {trend && <Sparkline values={trend} />}
      </div>
      <div className="flex items-center gap-2 text-2xs">
        {delta !== undefined && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-mono tabular',
              good ? 'text-success' : 'text-danger',
            )}
          >
            {delta >= 0 ? (
              <ArrowUpRight className="size-3" />
            ) : (
              <ArrowDownRight className="size-3" />
            )}
            {Math.abs(delta * 100).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-fg-subtle">{hint}</span>}
      </div>
    </div>
  )
}

/** Hairline-separated row of KPIs (1px gaps on a border-coloured background, no shadows) */
export function KPIGrid({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  )
}
