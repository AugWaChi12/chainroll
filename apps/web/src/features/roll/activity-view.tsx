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
} from '@chainroll/ui'
import { Aperture, ExternalLink, RefreshCw, WifiOff } from 'lucide-react'
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

export function ActivityView() {
  const t = useTranslations('activity')
  const format = useFormatter()
  const stockName = useStockName()
  const wallet = useWallet()
  const { rolls } = useMyRolls(wallet.address)

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

  const filtered = useMemo(
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
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-20 md:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-2xs tracking-wide text-frame">▸ {t('eyebrow')}</span>
          <h1 className="font-display text-3xl leading-none md:text-4xl">{t('title')}</h1>
          <p className="max-w-xl text-sm text-fg-muted">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void loadRecords()}>
            <RefreshCw />
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

      <div className="mb-8">
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

      {/* Filter tabs */}
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

      {filtered.length === 0 ? (
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
          {filtered.map((rec) => {
            const rollIdStr = rec.rollKey.split(':')[1] ?? '1'
            const stock = getStock(rec.filmId)
            const isRetrying = retryingHash === rec.hash

            return (
              <li
                key={rec.hash}
                className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5"
              >
                <div className="flex items-center gap-3.5">
                  <LatentFrame frame={rec.frame} status={rec.status} className="h-12 w-9 shrink-0" />
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

      <ConnectSheet open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  )
}
