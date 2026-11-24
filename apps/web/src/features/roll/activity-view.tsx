'use client'

import { getStock, useStockName } from '@/features/film'
import { ConnectSheet, activeChain, classifyTxError, useWallet } from '@/features/wallet'
import {
  Badge,
  Button,
  EmptyState,
  KPIGrid,
  KPIStat,
  LatentFrame,
  RebateLabel,
  TxHash,
  cn,
  truncateHash,
} from '@chainroll/ui'
import {
  Aperture,
  ExternalLink,
  Film,
  Gavel,
  Image as ImageIcon,
  Radio,
  RefreshCw,
  Sparkles,
  WifiOff,
} from 'lucide-react'
import type { Route } from 'next'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { photoStore, type PhotoRecord, type PhotoStatus } from './photo-store'
import { useMyRolls } from './use-my-rolls'

const STATUS_TONE: Record<PhotoStatus, 'success' | 'warning' | 'danger'> = {
  confirmed: 'success',
  pending: 'warning',
  failed: 'danger',
}

type LiveActivityKind = 'post' | 'roll' | 'print' | 'offer'

type LiveActivityItem = {
  id: string
  kind: LiveActivityKind
  actor: string
  actorHandle: string | null
  title: string
  detail: string
  postId?: string | null
  rollId?: number | null
  filmId?: number | null
  imageUrl?: string | null
  amountKub?: number | null
  txHash?: string | null
  timestamp: number
}

const KIND_BADGE: Record<LiveActivityKind, { label: string; tone: 'neutral' | 'frame' | 'success' | 'warning' }> = {
  post: { label: 'POST', tone: 'neutral' },
  roll: { label: 'ROLL', tone: 'frame' },
  print: { label: '1/1 PRINT', tone: 'success' },
  offer: { label: 'OFFER', tone: 'warning' },
}

export function ActivityView() {
  const t = useTranslations('activity')
  const format = useFormatter()
  const stockName = useStockName()
  const wallet = useWallet()
  const { rolls } = useMyRolls(wallet.address)

  const [viewMode, setViewMode] = useState<'network' | 'device'>('network')
  const [liveItems, setLiveItems] = useState<LiveActivityItem[]>([])
  const [liveLoading, setLiveLoading] = useState(false)
  const [kindFilter, setKindFilter] = useState<'all' | LiveActivityKind>('all')

  const [records, setRecords] = useState<PhotoRecord[]>([])
  const [filter, setFilter] = useState<'all' | PhotoStatus>('all')
  const [retryingHash, setRetryingHash] = useState<string | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [online, setOnline] = useState(true)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read initial browser online state
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    const onUp = () => setOnline(true)
    const onDown = () => setOnline(false)
    window.addEventListener('online', onUp)
    window.addEventListener('offline', onDown)
    return () => {
      window.removeEventListener('online', onUp)
      window.removeEventListener('offline', onDown)
    }
  }, [])

  const loadLiveActivity = useCallback(async () => {
    setLiveLoading(true)
    try {
      const res = await fetch('/api/activity?limit=50', { cache: 'no-store' })
      if (res.ok) {
        const data = (await res.json()) as { ok?: boolean; items?: LiveActivityItem[] }
        if (data.ok && Array.isArray(data.items)) {
          setLiveItems(data.items)
        }
      }
    } catch {
      /* ignore offline error */
    } finally {
      setLiveLoading(false)
    }
  }, [])

  const loadRecords = useCallback(async () => {
    const all = await photoStore.listAll()
    const prefix = `${activeChain.id}:`
    setRecords(all.filter((r) => r.rollKey.startsWith(prefix)))
  }, [])

  useEffect(() => {
    let alive = true
    const prefix = `${activeChain.id}:`
    void photoStore.listAll().then((all) => {
      if (!alive) return
      setRecords(all.filter((r) => r.rollKey.startsWith(prefix)))
    })
    void fetch('/api/activity?limit=50', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<{ ok?: boolean; items?: LiveActivityItem[] }>) : null))
      .then((data) => {
        if (!alive || !data?.ok || !Array.isArray(data.items)) return
        setLiveItems(data.items)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const retryRecord = useCallback(
    async (rec: PhotoRecord) => {
      if (!wallet.adapter) {
        setConnectOpen(true)
        return
      }
      const rollIdStr = rec.rollKey.split(':')[1]
      if (!rollIdStr) return
      const rollId = BigInt(rollIdStr)

      setRetryingHash(rec.hash)
      await photoStore.patch(rec.hash, {
        status: 'pending',
        errorCode: undefined,
        errorReason: undefined,
      })
      await loadRecords()

      try {
        const txHash = await wallet.adapter.shoot(rollId, rec.hash, {
          onEvent: (e) => {
            if (e.type === 'submitted') {
              void photoStore.patch(rec.hash, { txHash: e.hash }).then(loadRecords)
            }
          },
        })
        await photoStore.patch(rec.hash, { status: 'confirmed', txHash })
      } catch (err) {
        const { code, reason } = classifyTxError(err)
        if (reason === 'HashAlreadyUsed') {
          await photoStore.patch(rec.hash, { status: 'confirmed' })
        } else {
          await photoStore.patch(rec.hash, {
            status: 'failed',
            errorCode: code,
            errorReason: reason,
          })
        }
      } finally {
        setRetryingHash(null)
        await loadRecords()
      }
    },
    [loadRecords, wallet.adapter],
  )

  const filteredLive = useMemo(
    () => (kindFilter === 'all' ? liveItems : liveItems.filter((i) => i.kind === kindFilter)),
    [liveItems, kindFilter],
  )

  const filteredDevice = useMemo(
    () => (filter === 'all' ? records : records.filter((r) => r.status === filter)),
    [records, filter],
  )

  const confirmedCount = records.filter((r) => r.status === 'confirmed').length
  const pendingCount = records.filter((r) => r.status === 'pending').length
  const failedCount = records.filter((r) => r.status === 'failed').length

  const txBase = activeChain.blockExplorers?.default.url
    ? `${activeChain.blockExplorers.default.url}/tx/`
    : undefined

  return (
    <div className="mx-auto max-w-6xl px-4 pt-6 pb-20 sm:pt-10 md:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5 sm:mb-8 sm:pb-6">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-2xs tracking-wide text-frame">▸ {t('eyebrow')}</span>
          <h1 className="font-display text-2xl leading-none sm:text-3xl md:text-4xl">
            {t('title')}
          </h1>
          <p className="max-w-xl text-xs text-fg-muted sm:text-sm">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={liveLoading}
            onClick={() => {
              void loadLiveActivity()
              void loadRecords()
            }}
          >
            <RefreshCw className={cn(liveLoading && 'animate-spin')} />
            {t('refresh')}
          </Button>
          <Button variant="primary" size="sm" asChild>
            <Link href="/camera">
              <Aperture />
              {t('openCamera')}
            </Link>
          </Button>
        </div>
      </header>

      {!online && (
        <div
          role="status"
          className="mb-6 flex items-center gap-3 border border-warning/50 bg-bg-raised px-4 py-3 text-xs text-fg"
        >
          <WifiOff className="size-4 text-warning" aria-hidden />
          <span>{t('offlineBanner')}</span>
        </div>
      )}

      {/* Mode switcher: Live Network Feed vs Local Device Queue */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'network'}
            onClick={() => setViewMode('network')}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-xs border px-3 font-mono text-xs transition-colors',
              viewMode === 'network'
                ? 'border-frame bg-frame/15 text-frame'
                : 'border-border bg-bg-raised text-fg-muted hover:text-fg',
            )}
          >
            <Radio className="size-3.5" />
            <span>Live Feed ({liveItems.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'device'}
            onClick={() => setViewMode('device')}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-xs border px-3 font-mono text-xs transition-colors',
              viewMode === 'device'
                ? 'border-border-strong bg-bg-sunken text-fg'
                : 'border-border bg-bg-raised text-fg-muted hover:text-fg',
            )}
          >
            <span>My Device ({records.length})</span>
            {failedCount > 0 && (
              <span className="rounded-full bg-danger px-1.5 font-mono text-[10px] text-white">
                {failedCount}
              </span>
            )}
          </button>
        </div>

        {viewMode === 'network' && (
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['all', 'All'],
                ['post', 'Posts'],
                ['roll', 'Rolls'],
                ['print', '1/1 Prints'],
                ['offer', 'Offers'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                className={cn(
                  'h-7 rounded-xs border px-2.5 font-mono text-2xs transition-colors',
                  kindFilter === k
                    ? 'border-border-strong bg-bg-sunken text-fg'
                    : 'border-border bg-bg-raised text-fg-muted hover:text-fg',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {viewMode === 'network' ? (
        filteredLive.length === 0 ? (
          <EmptyState
            mark="00"
            title={t('empty.title')}
            description={t('empty.body')}
            action={
              <Button variant="primary" size="sm" asChild>
                <Link href="/camera">
                  <Aperture />
                  {t('openCamera')}
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border border border-border bg-bg-raised">
            {filteredLive.map((item) => {
              const badge = KIND_BADGE[item.kind]
              const Icon =
                item.kind === 'post'
                  ? ImageIcon
                  : item.kind === 'roll'
                    ? Film
                    : item.kind === 'print'
                      ? Sparkles
                      : Gavel
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {item.imageUrl ? (
                      <Link
                        href={(item.postId ? `/p/${item.postId}` : '/feed') as Route}
                        className="h-12 w-9 shrink-0 overflow-hidden border border-border bg-black"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.imageUrl}
                          alt={item.title}
                          className="size-full object-cover"
                        />
                      </Link>
                    ) : (
                      <div className="grid h-12 w-9 shrink-0 place-items-center border border-border bg-bg-sunken text-frame">
                        <Icon className="size-4" />
                      </div>
                    )}

                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                        {item.postId ? (
                          <Link
                            href={`/p/${item.postId}` as Route}
                            className="truncate text-sm font-medium text-fg hover:underline"
                          >
                            {item.title}
                          </Link>
                        ) : (
                          <span className="truncate text-sm font-medium text-fg">{item.title}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
                        <Link
                          href={`/u/${item.actor}` as Route}
                          className="font-mono text-2xs text-fg hover:underline"
                        >
                          {item.actorHandle ? `@${item.actorHandle}` : truncateHash(item.actor)}
                        </Link>
                        {item.detail && (
                          <span className="max-w-md truncate text-xs text-fg-subtle">
                            {item.detail}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {item.txHash && (
                      <span className="hidden sm:inline-flex">
                        <TxHash hash={item.txHash} explorerUrl={txBase} />
                      </span>
                    )}
                    <span className="font-mono text-2xs tabular text-fg-subtle">
                      {format.relativeTime(new Date(item.timestamp), new Date())}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )
      ) : (
        <>
          <div className="mb-6">
            <KPIGrid>
              <KPIStat label={t('kpi.confirmed')} value={format.number(confirmedCount)} />
              <KPIStat label={t('kpi.pending')} value={format.number(pendingCount)} />
              <KPIStat
                label={t('kpi.failed')}
                value={format.number(failedCount)}
                tone={failedCount > 0 ? 'danger' : 'default'}
              />
              <KPIStat label={t('kpi.rolls')} value={format.number(rolls.length)} />
            </KPIGrid>
          </div>

          <div className="mb-6 flex flex-wrap gap-1.5" role="tablist" aria-label={t('filterLabel')}>
            {(
              [
                ['all', `${t('tabs.all')} (${records.length})`],
                ['confirmed', `${t('tabs.confirmed')} (${confirmedCount})`],
                ['pending', `${t('tabs.pending')} (${pendingCount})`],
                ['failed', `${t('tabs.failed')} (${failedCount})`],
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

          {filteredDevice.length === 0 ? (
            <EmptyState
              mark="00"
              title={t('empty.title')}
              description={t('empty.body')}
              action={
                <Button variant="primary" size="sm" asChild>
                  <Link href="/camera">
                    <Aperture />
                    {t('openCamera')}
                  </Link>
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border border border-border bg-bg-raised">
              {filteredDevice.map((rec) => {
                const rollIdStr = rec.rollKey.split(':')[1] ?? '1'
                const stock = getStock(rec.filmId)
                const isRetrying = retryingHash === rec.hash

                return (
                  <li
                    key={rec.hash}
                    className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5"
                  >
                    <div className="flex items-center gap-3.5">
                      <LatentFrame
                        frame={rec.frame}
                        status={rec.status}
                        className="h-12 w-9 shrink-0"
                      />
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <RebateLabel>
                            {String(rec.frame).padStart(2, '0')}
                            {rec.frame % 2 ? 'A' : ''} · {stock.code}
                          </RebateLabel>
                          <Link
                            href={`/darkroom/${rollIdStr}` as Route}
                            className="inline-flex items-center gap-1 font-mono text-xs text-fg hover:underline"
                          >
                            {t('rollLink', { id: rollIdStr })}
                            <ExternalLink className="size-3 text-fg-subtle" />
                          </Link>
                          <span className="text-xs text-fg-muted">{stockName(rec.filmId)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 font-mono text-2xs text-fg-subtle">
                          <span>
                            {t('hashLabel')}: <TxHash hash={rec.hash} />
                          </span>
                          {rec.txHash && (
                            <span>
                              Tx: <TxHash hash={rec.txHash} explorerUrl={txBase} />
                            </span>
                          )}
                        </div>
                        {rec.status === 'failed' && rec.errorCode && (
                          <p className="text-xs text-danger">
                            {t(`errors.${rec.errorCode}` as Parameters<typeof t>[0])}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-2xs tabular text-fg-subtle">
                        {format.relativeTime(new Date(rec.takenAt), new Date())}
                      </span>
                      <Badge tone={STATUS_TONE[rec.status]} dot>
                        {t(`status.${rec.status}`)}
                      </Badge>
                      {(rec.status === 'failed' || rec.errorReason === 'offline') && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={isRetrying}
                          onClick={() => void retryRecord(rec)}
                        >
                          <RefreshCw className={cn(isRetrying && 'animate-spin')} />
                          {isRetrying ? t('retrying') : t('retryBtn')}
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      <ConnectSheet open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  )
}
