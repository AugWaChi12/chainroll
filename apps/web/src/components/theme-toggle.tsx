'use client'

import { cn } from '@chainroll/ui'
import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    const stored = localStorage.getItem('theme')
    if (stored === 'dark' || stored === 'light') return stored
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
  }

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={toggle}
      className={cn(
        'inline-flex size-8 items-center justify-center rounded-sm border border-border bg-bg-raised text-fg-muted transition-colors hover:border-border-strong hover:text-fg',
        className,
      )}
    >
      {theme === 'dark' ? (
        <Sun className="size-3.5 text-frame" aria-hidden />
      ) : (
        <Moon className="size-3.5" aria-hidden />
      )}
    </button>
  )
}