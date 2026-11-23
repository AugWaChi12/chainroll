'use client'

import { Button, Input, RebateLabel, cn } from '@chainroll/ui'
import { Flag, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { reportPost, type FeedPost, type FeedReportReason } from './post-store'
import { frameMark } from './post-visual'

const REASONS: readonly FeedReportReason[] = ['nsfw', 'spam', 'copyright', 'harassment']

export function ReportModal({
  post,
  reporterAddress,
  onClose,
  onReported,
}: {
  post: FeedPost
  reporterAddress: string
  onClose: () => void
  onReported: () => void
}) {
  const t = useTranslations('feed.report')
  const [reason, setReason] = useState<FeedReportReason>('spam')
  const [note, setNote] = useState('')

  const submit = () => {
    reportPost(post.id, reporterAddress, reason, note)
    onReported()
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-md border border-border-strong bg-bg-raised p-5 shadow-[var(--elev-pop)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <RebateLabel>
              {frameMark(post.frame)} · {post.id}
            </RebateLabel>
            <h2 className="font-display text-xl text-fg">{t('title')}</h2>
            <p className="text-xs text-fg-muted">{t('subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('cancel')}
            className="rounded-xs p-1 text-fg-muted hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={t('reasonLabel')}>
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => setReason(r)}
              className={cn(
                'flex items-center justify-between rounded-xs border px-3 py-2 text-left text-xs transition-colors duration-[var(--dur-fast)]',
                reason === r
                  ? 'border-border-strong bg-bg-sunken font-medium text-fg'
                  : 'border-border bg-bg text-fg-muted hover:text-fg',
              )}
            >
              <span>{t(`reasons.${r}`)}</span>
              {reason === r && <span className="font-mono text-2xs text-frame">▸</span>}
            </button>
          ))}
        </div>

        <Input
          label={t('noteLabel')}
          placeholder={t('notePlaceholder')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={submit}>
            <Flag />
            {t('submit')}
          </Button>
        </div>
      </div>
    </div>
  )
}
