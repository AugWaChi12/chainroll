'use client'

import { activeChain } from '@/features/wallet'
import {
  Badge,
  Button,
  DataTable,
  PageHeader,
  TxHash,
  cn,
  truncateHash,
  type ColumnDef,
} from '@chainroll/ui'
import { Download } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { downloadCsv, useAdminStore } from './audit-store'
import type { AuditCategory, AuditEntry } from './mock-data'

const CATEGORY_TONE: Record<AuditCategory, 'danger' | 'frame' | 'info' | 'warning' | 'success'> = {
  moderation: 'danger',
  films: 'frame',
  users: 'info',
  gas: 'warning',
  contract: 'success',
}

const CATEGORIES: readonly ('all' | AuditCategory)[] = [
  'all',
  'moderation',
  'films',
  'users',
  'gas',
  'contract',
]

export function AdminAudit() {
  const t = useTranslations('admin.audit')
  const format = useFormatter()
  const { audit } = useAdminStore()
  const [category, setCategory] = useState<'all' | AuditCategory>('all')

  const filtered = useMemo(
    () => (category === 'all' ? audit : audit.filter((a) => a.category === category)),
    [audit, category],
  )

  const columns = useMemo<ColumnDef<AuditEntry, unknown>[]>(
    () => [
      {
        accessorKey: 'category',
        header: t('cols.category'),
        size: 110,
        cell: ({ getValue }) => {
          const cat = getValue() as AuditCategory
          return <Badge tone={CATEGORY_TONE[cat]}>{t(`categories.${cat}`)}</Badge>
        },
      },
      {
        accessorKey: 'action',
        header: t('cols.action'),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-frame">▸ {String(getValue())}</span>
        ),
      },
      {
        accessorKey: 'actor',
        header: t('cols.actor'),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-fg-muted">
            {truncateHash(String(getValue()))}
          </span>
        ),
      },
      {
        accessorKey: 'target',
        header: t('cols.target'),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-fg">{String(getValue())}</span>
        ),
      },
      {
        accessorKey: 'detail',
        header: t('cols.detail'),
        cell: ({ getValue }) => (
          <span className="max-w-md truncate text-xs text-fg-muted">{String(getValue())}</span>
        ),
      },
      {
        accessorKey: 'txHash',
        header: t('cols.tx'),
        enableSorting: false,
        cell: ({ getValue }) => {
          const hash = getValue() as string | undefined
          const txBase = activeChain.blockExplorers?.default.url
            ? `${activeChain.blockExplorers.default.url}/tx/`
            : undefined
          return hash ? (
            <TxHash hash={hash} explorerUrl={txBase} />
          ) : (
            <span className="font-mono text-2xs text-fg-subtle">—</span>
          )
        },
      },
      {
        accessorKey: 'minutesAgo',
        header: t('cols.time'),
        cell: ({ getValue }) => {
          const mins = Number(getValue())
          return (
            <span className="font-mono text-xs tabular text-fg-muted">
              {mins === 0
                ? t('justNow')
                : format.relativeTime(
                    new Date(Date.UTC(2026, 11, 14) - mins * 60_000),
                    new Date(Date.UTC(2026, 11, 14)),
                  )}
            </span>
          )
        },
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
          <Button
            size="sm"
            onClick={() =>
              downloadCsv(
                'chainroll-audit-log.csv',
                ['id', 'category', 'action', 'actor', 'target', 'detail', 'txHash', 'minutesAgo'],
                filtered.map((a) => [
                  a.id,
                  a.category,
                  a.action,
                  a.actor,
                  a.target,
                  a.detail,
                  a.txHash ?? '',
                  a.minutesAgo,
                ]),
              )
            }
          >
            <Download />
            {t('export')}
          </Button>
        }
      >
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('filterLabel')}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={category === cat}
              onClick={() => setCategory(cat)}
              className={cn(
                'h-8 rounded-xs border px-3 font-mono text-xs transition-colors duration-[var(--dur-fast)]',
                category === cat
                  ? 'border-border-strong bg-bg-sunken text-fg'
                  : 'border-border bg-bg-raised text-fg-muted hover:text-fg',
              )}
            >
              {t(`categories.${cat}`)}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="px-4 py-6 md:px-8">
        <DataTable
          columns={columns}
          data={filtered}
          getRowId={(r) => r.id}
          pageSize={15}
        />
      </div>
    </>
  )
}
