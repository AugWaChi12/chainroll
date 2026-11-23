'use client'

import { FilmPreview, getStock } from '@/features/film'
import { useWallet } from '@/features/wallet'
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Kbd,
  PageHeader,
  RebateLabel,
  TxHash,
  cn,
  truncateHash,
} from '@chainroll/ui'
import { Ban, Check, EyeOff, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { recordAudit, removeAudit, setModerationDecision, useAdminStore } from './audit-store'
import type { ModerationDecision, ModerationItem } from './mock-data'

const DEFAULT_ACTOR = '0x243d78f9c2a0114e9b6c88a12f00431d9a4c9350'

type UndoEntry = {
  itemId: string
  postId: string
  previousStatus: ModerationDecision
  newStatus: Exclude<ModerationDecision, 'pending'>
  auditId: string
  expiresAt: number
}

const REASON_TONE = {
  nsfw: 'danger',
  spam: 'warning',
  copyright: 'info',
  harassment: 'danger',
} as const

const STATUS_TONE = {
  pending: 'warning',
  approved: 'success',
  hidden: 'neutral',
  banned: 'danger',
} as const

export function AdminModeration() {
  const t = useTranslations('admin.moderation')
  const { address } = useWallet()
  const { moderation } = useAdminStore()

  const [filter, setFilter] = useState<'pending' | 'resolved' | 'all'>('pending')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [undo, setUndo] = useState<UndoEntry | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const items = useMemo(() => {
    if (filter === 'pending') return moderation.filter((m) => m.status === 'pending')
    if (filter === 'resolved') return moderation.filter((m) => m.status !== 'pending')
    return moderation
  }, [moderation, filter])

  const activeItem: ModerationItem | null = useMemo(() => {
    if (items.length === 0) return null
    return items.find((m) => m.id === selectedId) ?? items[0] ?? null
  }, [items, selectedId])

  const activeIndex = useMemo(
    () => (activeItem ? items.findIndex((m) => m.id === activeItem.id) : -1),
    [items, activeItem],
  )

  // Countdown tick for 10s undo bar
  useEffect(() => {
    if (!undo) return
    const timer = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= undo.expiresAt) {
        setUndo(null)
      }
    }, 250)
    return () => window.clearInterval(timer)
  }, [undo])

  const act = useCallback(
    (decision: Exclude<ModerationDecision, 'pending'>) => {
      if (!activeItem) return
      const previousStatus = activeItem.status
      const nextCandidate = items[activeIndex + 1] ?? items[activeIndex - 1] ?? null
      const reasonText = note.trim() || t(`defaultNotes.${decision}`)

      setModerationDecision(activeItem.id, decision, reasonText)
      const actionKey =
        decision === 'approved'
          ? 'post.approve'
          : decision === 'hidden'
            ? 'post.hide'
            : 'user.ban'
      const auditId = recordAudit({
        actor: address ?? DEFAULT_ACTOR,
        category: 'moderation',
        action: actionKey,
        target: decision === 'banned' ? activeItem.shooter : activeItem.postId,
        detail: `${activeItem.postId} (${t(`reasons.${activeItem.reason}`)}) — ${reasonText}`,
      })

      const expiresAt = Date.now() + 10_000
      setNow(Date.now())
      setUndo({
        itemId: activeItem.id,
        postId: activeItem.postId,
        previousStatus,
        newStatus: decision,
        auditId,
        expiresAt,
      })
      setNote('')
      if (nextCandidate) setSelectedId(nextCandidate.id)
    },
    [activeItem, activeIndex, address, items, note, t],
  )

  const handleUndo = useCallback(() => {
    if (!undo) return
    setModerationDecision(undo.itemId, undo.previousStatus)
    removeAudit(undo.auditId)
    setSelectedId(undo.itemId)
    setUndo(null)
  }, [undo])

  // Keyboard shortcuts: J/K move, A approve, H hide, B ban (§8.2)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const key = e.key.toLowerCase()
      if (key === 'j') {
        e.preventDefault()
        const next = items[Math.min(items.length - 1, activeIndex + 1)]
        if (next) setSelectedId(next.id)
      } else if (key === 'k') {
        e.preventDefault()
        const prev = items[Math.max(0, activeIndex - 1)]
        if (prev) setSelectedId(prev.id)
      } else if (key === 'a') {
        e.preventDefault()
        act('approved')
      } else if (key === 'h') {
        e.preventDefault()
        act('hidden')
      } else if (key === 'b') {
        e.preventDefault()
        act('banned')
      } else if (key === 'z' && undo) {
        e.preventDefault()
        handleUndo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeIndex, act, handleUndo, items, undo])

  const pendingCount = moderation.filter((m) => m.status === 'pending').length
  const resolvedCount = moderation.length - pendingCount
  const secondsLeft = undo ? Math.max(1, Math.ceil((undo.expiresAt - now) / 1000)) : 0

  return (
    <>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex flex-wrap items-center gap-3 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd> {t('shortcuts.move')}
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>A</Kbd> {t('shortcuts.approve')}
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>H</Kbd> {t('shortcuts.hide')}
            </span>
            <span className="inline-flex items-center gap-1">
              <Kbd>B</Kbd> {t('shortcuts.ban')}
            </span>
          </div>
        }
      >
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('filterLabel')}>
          {(
            [
              ['pending', `${t('tabs.pending')} (${pendingCount})`],
              ['resolved', `${t('tabs.resolved')} (${resolvedCount})`],
              ['all', `${t('tabs.all')} (${moderation.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                'h-8 rounded-xs border px-3 font-mono text-xs transition-colors duration-[var(--dur-fast)]',
                filter === key
                  ? 'border-border-strong bg-bg-sunken text-fg'
                  : 'border-border bg-bg-raised text-fg-muted hover:text-fg',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="flex flex-col gap-6 px-4 py-6 md:px-8">
        {undo && (
          <div
            role="status"
            aria-live="polite"
            className="flex flex-wrap items-center justify-between gap-3 border border-frame/50 bg-bg-raised px-4 py-2.5"
          >
            <div className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs text-frame">▸ {undo.postId}</span>
              <span>{t(`undoBanner.${undo.newStatus}`)}</span>
              <span className="font-mono text-xs tabular text-fg-muted">({secondsLeft}s)</span>
            </div>
            <Button variant="secondary" size="sm" onClick={handleUndo}>
              <RotateCcw />
              {t('undo')} <Kbd>Z</Kbd>
            </Button>
          </div>
        )}

        {items.length === 0 || !activeItem ? (
          <EmptyState
            mark="02"
            title={t('empty.title')}
            description={t('empty.body')}
            action={
              filter !== 'all' ? (
                <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
                  {t('tabs.all')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Queue list */}
            <div
              role="listbox"
              aria-label={t('queueLabel')}
              className="flex flex-col divide-y divide-border self-start border border-border bg-bg-raised lg:col-span-5"
            >
              {items.map((item, idx) => {
                const selected = item.id === activeItem.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      'flex flex-col gap-1.5 px-3.5 py-3 text-left transition-colors duration-[var(--dur-fast)]',
                      selected
                        ? 'bg-bg-sunken shadow-[inset_2px_0_0_var(--accent)]'
                        : 'hover:bg-bg-sunken/50',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-2xs tabular text-fg-subtle">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span className="font-mono text-xs text-frame">▸ {item.frame}</span>
                        <span className="text-xs font-medium text-fg">
                          {item.handle ?? truncateHash(item.shooter)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {item.confidence !== null && (
                          <Badge tone={item.confidence >= 80 ? 'danger' : 'warning'}>
                            AI {item.confidence}%
                          </Badge>
                        )}
                        <Badge tone={REASON_TONE[item.reason]}>{t(`reasons.${item.reason}`)}</Badge>
                        {item.status !== 'pending' && (
                          <Badge tone={STATUS_TONE[item.status]} dot>
                            {t(`status.${item.status}`)}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="truncate text-xs text-fg-muted">{item.caption}</p>
                    <div className="flex items-center justify-between font-mono text-2xs text-fg-subtle">
                      <span>
                        {item.postId} · {item.film}
                      </span>
                      <span>
                        {item.reportCount > 0
                          ? t('reportCount', { count: item.reportCount })
                          : t('aiFlagged')}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Active item inspector */}
            <div className="flex flex-col gap-4 border border-border bg-bg-raised p-4 md:p-5 lg:col-span-7">
              <div className="grid gap-5 md:grid-cols-12">
                {/* Frame preview */}
                <div className="flex flex-col gap-2 bg-[#0e0c0b] p-2.5 md:col-span-5">
                  {activeItem.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={activeItem.imageUrl}
                      alt={activeItem.caption || activeItem.postId}
                      className="aspect-[2/3] w-full object-cover"
                    />
                  ) : (
                    <FilmPreview
                      look={getStock(activeItem.filmId).look}
                      scene={activeItem.scene}
                      className="aspect-[2/3] w-full"
                    />
                  )}
                  <div className="flex items-center justify-between font-mono text-2xs text-frame">
                    <span>▸ {activeItem.frame}</span>
                    <span>{activeItem.film}</span>
                  </div>
                </div>

                {/* Metadata & Reason */}
                <div className="flex flex-col justify-between gap-4 md:col-span-7">
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <RebateLabel>{activeItem.postId}</RebateLabel>
                      <Badge tone={STATUS_TONE[activeItem.status]} dot>
                        {t(`status.${activeItem.status}`)}
                      </Badge>
                    </div>

                    <div className="border-l-2 border-border-strong pl-3">
                      <p className="text-sm text-fg">{activeItem.caption}</p>
                    </div>

                    <dl className="grid grid-cols-2 gap-2 border border-border bg-bg p-3 text-xs">
                      <div>
                        <dt className="text-2xs text-fg-subtle">{t('fields.shooter')}</dt>
                        <dd className="font-mono text-fg">
                          {activeItem.handle ? `${activeItem.handle} · ` : ''}
                          {truncateHash(activeItem.shooter)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-2xs text-fg-subtle">{t('fields.reporter')}</dt>
                        <dd className="font-mono text-fg">
                          {activeItem.reporter.startsWith('0x')
                            ? truncateHash(activeItem.reporter)
                            : activeItem.reporter}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-2xs text-fg-subtle">{t('fields.reason')}</dt>
                        <dd className="flex items-center gap-1.5 font-medium text-fg">
                          <ShieldAlert className="size-3.5 text-danger" />
                          {t(`reasons.${activeItem.reason}`)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-2xs text-fg-subtle">{t('fields.photoHash')}</dt>
                        <dd>
                          <TxHash hash={activeItem.photoHash} />
                        </dd>
                      </div>
                    </dl>

                    {activeItem.confidence !== null && (
                      <div className="flex flex-col gap-1 border border-border bg-bg p-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-1.5 text-fg-muted">
                            <Sparkles className="size-3.5 text-frame" />
                            {t('fields.confidence')}
                          </span>
                          <span className="font-mono tabular text-fg">
                            {activeItem.confidence}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-bg-sunken">
                          <div
                            className={cn(
                              'h-full',
                              activeItem.confidence >= 80 ? 'bg-danger' : 'bg-warning',
                            )}
                            style={{ width: `${activeItem.confidence}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Reason note + quick chips */}
                  <div className="flex flex-col gap-2">
                    <Input
                      label={t('noteLabel')}
                      placeholder={t('notePlaceholder')}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {(['falsePositive', 'spamLink', 'nsfwViolation', 'repeatOffender'] as const).map(
                        (preset) => {
                          const text = t(`presets.${preset}`)
                          return (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setNote(text)}
                              className="rounded-xs border border-border px-2 py-0.5 text-2xs text-fg-muted hover:border-border-strong hover:text-fg"
                            >
                              {text}
                            </button>
                          )
                        },
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons with keyboard hints */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                <span className="font-mono text-2xs text-fg-subtle">
                  {activeIndex + 1} / {items.length}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => act('approved')}>
                    <Check />
                    {t('actions.approve')}
                    <Kbd>A</Kbd>
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => act('hidden')}>
                    <EyeOff />
                    {t('actions.hide')}
                    <Kbd>H</Kbd>
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => act('banned')}>
                    <Ban />
                    {t('actions.ban')}
                    <Kbd>B</Kbd>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
