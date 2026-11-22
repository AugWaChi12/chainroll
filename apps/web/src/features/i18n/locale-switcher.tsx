'use client'

import { LOCALE_COOKIE, LOCALES, type Locale } from '@/lib/locale'
import { cn } from '@chainroll/ui'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

function saveLocale(l: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`
}

/** TH / EN toggle. Stores the choice in a cookie and re-renders server components. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const t = useTranslations('locale')
  const current = useLocale() as Locale
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const set = (l: Locale) => {
    if (l === current) return
    saveLocale(l)
    startTransition(() => router.refresh())
  }

  return (
    <div
      role="group"
      aria-label={t('label')}
      className={cn(
        'flex h-8 items-center rounded-sm border border-border p-0.5 font-mono text-2xs',
        pending && 'opacity-60',
        className,
      )}
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === current}
          onClick={() => set(l)}
          className={cn(
            'h-full rounded-xs px-2 uppercase transition-colors',
            l === current ? 'bg-bg-sunken text-fg' : 'text-fg-subtle hover:text-fg',
          )}
        >
          {l}
        </button>
      ))}
    </div>
  )
}
