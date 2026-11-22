import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../lib/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-xs border px-1.5 py-px font-mono text-2xs uppercase tracking-wide',
  {
    variants: {
      tone: {
        neutral: 'border-border-strong text-fg-muted',
        success: 'border-success/40 text-success',
        warning: 'border-warning/40 text-warning',
        danger: 'border-danger/40 text-danger',
        info: 'border-info/40 text-info',
        frame: 'border-frame/50 text-frame',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { dot?: boolean }

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}
