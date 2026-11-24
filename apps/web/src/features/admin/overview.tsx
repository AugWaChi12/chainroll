'use client'

import { useWallet } from '@/features/wallet'
import {
  Badge,
  Button,
  DataTable,
  KPIGrid,
  KPIStat,
  PageHeader,
  TxHash,
  cn,
  truncateHash,
  type ColumnDef,
} from '@chainroll/ui'
import { kubTestnet } from '@chainroll/shared'
import { Download, Fuel, Loader2, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { bulkHidePosts, downloadCsv, refreshAdminDashboard, useAdminStore } from './audit-store'
import { kpis as seedKpis, type ShotRow } from './mock-data'

const DEFAULT_ACTOR = '0x243d78f9c2a0114e9b6c88a12f00431d9a4c9350'
const STATUS_TONE = { confirmed: 'success', pending: 'warning', failed: 'danger' } as const

export function AdminOverview() {
  const t = useTranslations('admin.overview')
  const format = useFormatter()
  const { address } = useWallet()
  const { kpis, recentShots, moderation, loading } = useAdminStore()
  const openReports = moderation.filter((m) => m.status === 'pending').length
  const n = (v: number) => format.number(v)
  const daysLeft = Math.floor(seedKpis.relayer.balance / seedKpis.relayer.burnPerDay)

  const [visualStats, setVisualStats] = useState<{
    geminiConfigured: boolean
    totalPosts: number
    aiTaggedPosts: number
    untaggedPosts: number
  } | null>(null)
  const [reindexing, setReindexing] = useState(false)
  const [reindexNote, setReindexNote] = useState<string | null>(null)

  const parseVisualStats = (data: {
    ok?: boolean
    geminiConfigured?: boolean
    totalPosts?: number
    aiTaggedPosts?: number
    untaggedPosts?: number
  }) => {
    if (!data.ok) return null
    return {
      geminiConfigured: Boolean(data.geminiConfigured),
      totalPosts: Number(data.totalPosts ?? 0),
      aiTaggedPosts: Number(data.aiTaggedPosts ?? 0),
      untaggedPosts: Number(data.untaggedPosts ?? 0),
    }
  }

  useEffect(() => {
    let alive = true
    void window
      .fetch('/api/admin/reindex-visual', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!alive || !data) return
        const next = parseVisualStats(data)
        if (next) setVisualStats(next)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const handleReindexVisual = async () => {
    setReindexing(true)
    setReindexNote(null)
    try {
      const res = await window.fetch('/api/admin/reindex-visual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 25 }),
      })
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean
        geminiConfigured?: boolean
        processed?: number
        tagged?: number
        skipped?: number
        error?: string
      } | null
      if (!res.ok || !data?.ok) {
        setReindexNote(data?.error ?? `HTTP ${res.status}`)
      } else if (!data.geminiConfigured) {
        setReindexNote(t('aiIndex.noKeyNote'))
      } else {
        setReindexNote(
          t('aiIndex.doneNote', {
            tagged: data.tagged ?? 0,
            processed: data.processed ?? 0,
          }),
        )
      }
      const statsRes = await window.fetch('/api/admin/reindex-visual', { cache: 'no-store' })
      if (statsRes.ok) {
        const next = parseVisualStats(await statsRes.json())
        if (next) setVisualStats(next)
      }
    } finally {
      setReindexing(false)
    }
  }

  const columns = useMemo<ColumnDef<ShotRow, unknown>[]>(
    () => [
      {
        accessorKey: 'frame',
        header: t('cols.frame'),
        size: 72,
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-frame">▸ {String(getValue())}</span>
        ),
      },
      {
        id: 'shooter',
        accessorFn: (r) => `${r.handle ?? ''} ${r.shooter}`,
        header: t('cols.shooter'),
        cell: ({ row }) => (
          <div className="flex flex-col leading-tight">
            <span className="text-sm">{row.original.handle ?? '—'}</span>
            <span className="font-mono text-2xs text-fg-subtle">
              {truncateHash(row.original.shooter)}
            </span>
          </div>
        ),
      },
      { accessorKey: 'film', header: t('cols.film') },
      {
        accessorKey: 'wallet',
        header: t('cols.wallet'),
        cell: ({ getValue }) => (
          <span className="text-xs text-fg-muted">
            {getValue() === 'bitkub-next' ? 'Bitkub NEXT' : 'MetaMask'}
          </span>
        ),
      },
      {
        accessorKey: 'txHash',
        header: t('cols.tx'),
        enableSorting: false,
        cell: ({ getValue }) => (
          <TxHash
            hash={String(getValue())}
            explorerUrl={`${kubTestnet.blockExplorers.default.url}/tx/`}
          />
        ),
      },
      {
        accessorKey: 'status',
        header: t('cols.status'),
        cell: ({ getValue }) => {
          const s = getValue() as ShotRow['status']
          return (
            <Badge tone={STATUS_TONE[s]} dot>
              {t(`status.${s}`)}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'minutesAgo',
        header: t('cols.time'),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs tabular text-fg-muted">
            {format.relativeTime(
              new Date(Date.UTC(2026, 11, 14) - Number(getValue()) * 60_000),
              new Date(Date.UTC(2026, 11, 14)),
            )}
          </span>
        ),
      },
    ],
    [t, format],
  )

  return (
    <>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={() => void refreshAdminDashboard()}
            >
              <RefreshCw className={cn(loading && 'animate-spin')} />
              {t('refresh')}
            </Button>
            <Button
              size="sm"
              onClick={() =>
                downloadCsv(
                  'chainroll-recent-shots.csv',
                  ['id', 'frame', 'shooter', 'handle', 'film', 'wallet', 'txHash', 'status', 'minutesAgo'],
                  recentShots.map((r) => [
                    r.id,
                    r.frame,
                    r.shooter,
                    r.handle,
                    r.film,
                    r.wallet,
                    r.txHash,
                    r.status,
                    r.minutesAgo,
                  ]),
                )
              }
            >
              <Download />
              {t('export')}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-6 px-4 py-6 md:px-8">
        {/* relayer warning — shown when < 3 days left (§8.1) */}
        {daysLeft < 3 && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-4 border border-danger/40 bg-bg-raised px-4 py-3 shadow-[inset_2px_0_0_var(--danger)]"
          >
            <TriangleAlert className="size-4 text-danger" aria-hidden />
            <div className="flex flex-1 flex-col">
              <span className="text-sm font-medium">{t('relayer.title', { days: daysLeft })}</span>
              <span className="font-mono text-xs text-fg-muted">
                {t('relayer.body', {
                  balance: n(seedKpis.relayer.balance),
                  burn: n(seedKpis.relayer.burnPerDay),
                })}
              </span>
            </div>
            <Button variant="danger" size="sm">
              <Fuel />
              {t('relayer.action')}
            </Button>
          </div>
        )}

        <KPIGrid>
          <KPIStat
            label={t('kpi.shots')}
            value={n(kpis.shotsToday)}
            hint={`${n(kpis.shotsTotal)} total`}
            trend={seedKpis.shots.trend}
          />
          <KPIStat
            label={t('kpi.txFailed')}
            value={n(kpis.txFailed)}
            higherIsBetter={false}
            hint={t('kpi.vsYesterday')}
            trend={seedKpis.txFailed.trend}
          />
          <KPIStat
            label={t('kpi.activeUsers')}
            value={n(kpis.activeUsers)}
            hint={t('kpi.vsYesterday')}
            trend={seedKpis.activeUsers.trend}
          />
          <KPIStat
            label={t('kpi.openReports')}
            value={n(openReports)}
            hint={t('kpi.needsReview')}
            tone={openReports > 0 ? 'danger' : 'default'}
          />
        </KPIGrid>

        {/* AI Visual Search Index Panel */}
        <section className="flex flex-wrap items-center justify-between gap-4 border border-border bg-bg-raised px-4 py-3.5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-frame" aria-hidden />
              <span className="text-sm font-medium">{t('aiIndex.title')}</span>
              {visualStats && (
                <Badge tone={visualStats.geminiConfigured ? 'success' : 'warning'} dot>
                  {visualStats.geminiConfigured ? t('aiIndex.active') : t('aiIndex.baseline')}
                </Badge>
              )}
            </div>
            <p className="font-mono text-xs text-fg-muted">
              {visualStats
                ? t('aiIndex.stats', {
                    tagged: visualStats.aiTaggedPosts,
                    total: visualStats.totalPosts,
                    pending: visualStats.untaggedPosts,
                  })
                : t('aiIndex.loading')}
            </p>
            {reindexNote && <p className="font-mono text-2xs text-frame">{reindexNote}</p>}
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={reindexing}
            onClick={() => void handleReindexVisual()}
          >
            {reindexing ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {reindexing ? t('aiIndex.indexing') : t('aiIndex.action')}
          </Button>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-md font-medium">{t('recent')}</h2>
          <DataTable
            columns={columns}
            data={recentShots}
            getRowId={(r) => r.id}
            selectable
            pageSize={12}
            bulkActions={(selectedRows) => (
              <Button
                variant="danger"
                size="sm"
                onClick={() =>
                  bulkHidePosts(
                    selectedRows.map((r) => r.id),
                    address ?? DEFAULT_ACTOR,
                  )
                }
              >
                {t('bulkHide')} ({selectedRows.length})
              </Button>
            )}
          />
        </section>
      </div>
    </>
  )
}
