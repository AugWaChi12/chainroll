'use client'

import { getStock } from '@/features/film'
import { Button, RebateLabel, TxHash, cn } from '@deekub/ui'
import { Download, X } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useRef } from 'react'
import type { Shot } from './camera-view'

type Props = {
  shots: Shot[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}

/** Full-screen review of the current roll: the photo, its on-chain fingerprint, and a contact strip. */
export function ReviewSheet({ shots, index, onIndex, onClose }: Props) {
  const t = useTranslations('camera.reviewSheet')
  const format = useFormatter()
  const closeRef = useRef<HTMLButtonElement>(null)
  const shot = shots[index]

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1))
      if (e.key === 'ArrowRight') onIndex(Math.min(shots.length - 1, index + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, onClose, onIndex, shots.length])

  if (!shot) return null
  const stock = getStock(shot.filmId)
  const ext = shot.mime === 'image/webp' ? 'webp' : 'jpg'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
      className="fixed inset-0 z-50 flex flex-col bg-bg"
    >
      <header className="flex h-14 shrink-0 items-center justify-between px-3">
        <RebateLabel>
          {String(shot.frame).padStart(2, '0')}A · {stock.code}
        </RebateLabel>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="rounded-xs p-2 text-fg-muted hover:text-fg"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL */}
        <img
          src={shot.url}
          alt={t('alt', { frame: shot.frame })}
          className="max-h-full max-w-full object-contain"
          style={{ animation: 'develop-in 900ms var(--motion-out) both' }}
        />
      </div>

      <dl className="mx-auto grid w-full max-w-md shrink-0 grid-cols-2 gap-x-4 gap-y-1.5 px-4 pt-4 font-mono text-2xs text-fg-muted">
        <dt>{t('size')}</dt>
        <dd className="text-right text-fg tabular">
          {format.number(shot.bytes / 1024, { maximumFractionDigits: 0 })} KB · {shot.width}×
          {shot.height}
        </dd>
        <dt>{t('format')}</dt>
        <dd className="text-right text-fg">
          {shot.mime.replace('image/', '').toUpperCase()} · q{Math.round(shot.quality * 100)}
        </dd>
        <dt>{t('hash')}</dt>
        <dd className="flex justify-end">
          <TxHash hash={shot.hash} />
        </dd>
      </dl>
      <p className="mx-auto max-w-md px-4 pt-2 text-center text-2xs text-fg-subtle">
        {t('hashNote')}
      </p>

      <div className="flex shrink-0 items-center gap-3 px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="list">
          {shots.map((s, i) => (
            <button
              key={s.hash}
              type="button"
              role="listitem"
              onClick={() => onIndex(i)}
              aria-label={t('alt', { frame: s.frame })}
              aria-current={i === index}
              className={cn(
                'relative h-14 w-10 shrink-0 overflow-hidden border',
                i === index ? 'border-frame' : 'border-transparent opacity-60',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL */}
              <img src={s.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
        <Button size="sm" asChild>
          <a href={shot.url} download={`chainroll-${String(shot.frame).padStart(2, '0')}.${ext}`}>
            <Download />
            {t('download')}
          </a>
        </Button>
      </div>
    </div>
  )
}
