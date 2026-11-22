import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn'

/** Skeleton — match the real shape of what's loading (§9.3), never a centered spinner. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-xs bg-bg-sunken', className)}
      {...props}
    />
  )
}

/** Keyboard key hint */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-border-strong px-1 font-mono text-2xs text-fg-muted',
        className,
      )}
      {...props}
    />
  )
}

export type EmptyStateProps = {
  /** Short reason the area is empty */
  title: string
  description?: string
  action?: ReactNode
  /** Frame number shown as a film-rebate mark, e.g. "00" */
  mark?: string
  className?: string
}

/** Empty state: say why it's empty + the next action (§9.3) */
export function EmptyState({
  title,
  description,
  action,
  mark = '00',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3 border border-dashed border-border-strong px-6 py-10',
        className,
      )}
    >
      <span className="font-mono text-2xs tracking-widest text-frame">▸ {mark}</span>
      <div className="flex flex-col gap-1">
        <p className="font-display text-xl text-fg">{title}</p>
        {description && <p className="max-w-prose text-sm text-fg-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export type ErrorStateProps = {
  title: string
  description?: string
  errorId?: string
  onRetry?: () => void
  retryLabel?: string
}

export function ErrorState({
  title,
  description,
  errorId,
  onRetry,
  retryLabel = 'ลองใหม่',
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 border-l-2 border-danger bg-bg-raised px-5 py-4"
    >
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="text-sm text-fg-muted">{description}</p>}
      <div className="flex items-center gap-4">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-medium text-fg underline decoration-border-strong underline-offset-4 hover:decoration-fg"
          >
            {retryLabel}
          </button>
        )}
        {errorId && <span className="font-mono text-2xs text-fg-subtle">ref {errorId}</span>}
      </div>
    </div>
  )
}
