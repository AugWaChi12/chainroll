import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'
import { cn } from '../lib/cn'

export type InputProps = ComponentProps<'input'> & {
  label?: string
  hint?: string
  error?: string
  /** Icon or text rendered inside the left edge */
  leading?: ReactNode
  /** Keyboard hint or unit rendered inside the right edge */
  trailing?: ReactNode
}

export function Input({
  label,
  hint,
  error,
  leading,
  trailing,
  className,
  id,
  ...props
}: InputProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-fg">
          {label}
        </label>
      )}
      <div
        className={cn(
          'flex h-10 items-center gap-2 rounded-sm border bg-bg-raised px-3 text-sm',
          'transition-colors duration-[var(--dur-fast)]',
          'focus-within:border-focus focus-within:outline focus-within:outline-2 focus-within:outline-offset-[-1px] focus-within:outline-focus',
          error ? 'border-danger' : 'border-border-strong hover:border-fg-subtle',
          className,
        )}
      >
        {leading && <span className="text-fg-subtle [&_svg]:size-4">{leading}</span>}
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle"
          {...props}
        />
        {trailing && <span className="text-fg-subtle">{trailing}</span>}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
