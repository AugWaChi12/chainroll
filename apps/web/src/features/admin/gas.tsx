'use client'

import { useWallet } from '@/features/wallet'
import {
  Badge,
  Button,
  DataTable,
  Input,
  KPIGrid,
  KPIStat,
  PageHeader,
  truncateHash,
  type ColumnDef,
} from '@chainroll/ui'
import { Check, Fuel, ShieldBan, TriangleAlert } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { recordAudit } from './audit-store'
import { initialSpenders, kpis, type SpenderRow } from './mock-data'

const DEFAULT_ACTOR = '0x243d78f9c2a0114e9b6c88a12f00431d9a4c9350'

const STATUS_TONE = {
  normal: 'success',
  flagged: 'warning',
  limited: 'danger',
} as const

export function AdminGas() {
  const t = useTranslations('admin.gas')
  const format = useFormatter()
  const { address } = useWallet()

  const [freeRollsPerDay, setFreeRollsPerDay] = useState<number>(1)
  const [gaslessTxPerUser, setGaslessTxPerUser] = useState<number>(26)
  const [dailyBudgetKub, setDailyBudgetKub] = useState<number>(100)
  const [maxTxPerMin, setMaxTxPerMin] = useState<number>(3)
  const [savedToast, setSavedToast] = useState<boolean>(false)
  const [spenders, setSpenders] = useState<SpenderRow[]>(initialSpenders)

  const daysLeft = Math.floor(kpis.relayer.balance / kpis.relayer.burnPerDay)

  const savePolicy = () => {
    recordAudit({
      actor: address ?? DEFAULT_ACTOR,
      category: 'gas',
      action: 'quota.update',
      target: 'Global Quota Policy',
      detail: `freeRolls=${freeRollsPerDay}/day · gaslessTx=${gaslessTxPerUser}/day · budget=${dailyBudgetKub} KUB/day · maxRate=${maxTxPerMin} tx/min`,
    })
    setSavedToast(true)
    window.setTimeout(() => setSavedToast(false), 3000)
  }

  const toggleRateLimit = (row: SpenderRow) => {
    const nextStatus: SpenderRow['status'] = row.status === 'limited' ? 'normal' : 'limited'
    setSpenders((prev) =>
      prev.map((s) => (s.address === row.address ? { ...s, status: nextStatus } : s)),
    )
    recordAudit({
      actor: address ?? DEFAULT_ACTOR,
      category: 'gas',
      action: nextStatus === 'limited' ? 'quota.limit' : 'quota.unlimit',
      target: row.handle ?? row.address,
      detail:
        nextStatus === 'limited'
          ? `Rate-limited at ${row.txPerMin} tx/min (${row.txToday} tx today)`
          : 'Rate-limit lifted',
    })
  }

  const columns = useMemo<ColumnDef<SpenderRow, unknown>[]>(
    () => [
      {
        id: 'account',
        accessorFn: (r) => `${r.handle ?? ''} ${r.address}`,
        header: t('cols.account'),
        cell: ({ row }) => (
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-medium">{row.original.handle ?? '—'}</span>
            <span className="font-mono text-2xs text-fg-subtle">
              {truncateHash(row.original.address)}
            </span>
          </div>
        ),
      },
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
        accessorKey: 'txToday',
        header: t('cols.txToday'),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs tabular">{format.number(Number(getValue()))}</span>
        ),
      },
      {
        accessorKey: 'txPerMin',
        header: t('cols.txPerMin'),
        cell: ({ getValue }) => {
          const v = Number(getValue())
          return (
            <span
              className={
                v >= maxTxPerMin
                  ? 'font-mono text-xs tabular text-danger'
                  : 'font-mono text-xs tabular text-fg'
              }
            >
              {v.toFixed(1)} / min
            </span>
          )
        },
      },
      {
        accessorKey: 'kubSpent',
        header: t('cols.kubSpent'),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs tabular">{Number(getValue()).toFixed(3)} KUB</span>
        ),
      },
      {
        accessorKey: 'status',
        header: t('cols.status'),
        cell: ({ getValue }) => {
          const s = getValue() as SpenderRow['status']
          return (
            <Badge tone={STATUS_TONE[s]} dot>
              {t(`status.${s}`)}
            </Badge>
          )
        },
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => {
          const isLimited = row.original.status === 'limited'
          return (
            <Button
              variant={isLimited ? 'secondary' : 'danger'}
              size="sm"
              onClick={() => toggleRateLimit(row.original)}
            >
              <ShieldBan />
              {isLimited ? t('actions.unlimit') : t('actions.limit')}
            </Button>
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, format, maxTxPerMin, address],
  )

  return (
    <>
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />

      <div className="flex flex-col gap-6 px-4 py-6 md:px-8">
        {daysLeft < 3 && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-4 border border-danger/40 bg-bg-raised px-4 py-3 shadow-[inset_2px_0_0_var(--danger)]"
          >
            <TriangleAlert className="size-4 text-danger" aria-hidden />
            <div className="flex flex-1 flex-col">
              <span className="text-sm font-medium">{t('relayerAlert.title', { days: daysLeft })}</span>
              <span className="font-mono text-xs text-fg-muted">
                {t('relayerAlert.body', {
                  balance: format.number(kpis.relayer.balance),
                  burn: format.number(kpis.relayer.burnPerDay),
                })}
              </span>
            </div>
            <Button variant="danger" size="sm">
              <Fuel />
              {t('relayerAlert.topUp')}
            </Button>
          </div>
        )}

        <KPIGrid>
          <KPIStat
            label={t('kpi.balance')}
            value={`${format.number(kpis.relayer.balance)} KUB`}
            hint={t('kpi.daysLeft', { days: daysLeft })}
            tone={daysLeft < 3 ? 'danger' : 'default'}
          />
          <KPIStat
            label={t('kpi.burnRate')}
            value={`${format.number(kpis.relayer.burnPerDay)} KUB`}
            hint={t('kpi.budgetHint', { budget: dailyBudgetKub })}
          />
          <KPIStat
            label={t('kpi.avgShotGas')}
            value="55,200"
            hint="~0.00138 KUB @ 25 Gwei"
          />
          <KPIStat
            label={t('kpi.flaggedAccounts')}
            value={String(spenders.filter((s) => s.status !== 'normal').length)}
            hint={t('kpi.thresholdHint', { rate: maxTxPerMin })}
            tone="danger"
          />
        </KPIGrid>

        {/* Policy configuration */}
        <section className="flex flex-col gap-4 border border-border bg-bg-raised p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
            <div>
              <h2 className="text-sm font-semibold">{t('policyTitle')}</h2>
              <p className="text-xs text-fg-muted">{t('policySubtitle')}</p>
            </div>
            <div className="flex items-center gap-3">
              {savedToast && (
                <span className="font-mono text-xs text-success">{t('policySaved')}</span>
              )}
              <Button variant="primary" size="sm" onClick={savePolicy}>
                <Check />
                {t('savePolicy')}
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              label={t('fields.freeRolls')}
              type="number"
              min={1}
              max={10}
              value={String(freeRollsPerDay)}
              onChange={(e) => setFreeRollsPerDay(Number(e.target.value) || 1)}
              trailing="rolls"
            />
            <Input
              label={t('fields.gaslessQuota')}
              type="number"
              min={0}
              max={200}
              value={String(gaslessTxPerUser)}
              onChange={(e) => setGaslessTxPerUser(Number(e.target.value) || 0)}
              trailing="tx/day"
            />
            <Input
              label={t('fields.dailyBudget')}
              type="number"
              min={10}
              max={5000}
              value={String(dailyBudgetKub)}
              onChange={(e) => setDailyBudgetKub(Number(e.target.value) || 100)}
              trailing="KUB"
            />
            <Input
              label={t('fields.botThreshold')}
              type="number"
              min={1}
              max={60}
              step={0.5}
              value={String(maxTxPerMin)}
              onChange={(e) => setMaxTxPerMin(Number(e.target.value) || 3)}
              trailing="tx/min"
            />
          </div>
        </section>

        {/* Top spenders & rate-limiting */}
        <section className="flex flex-col gap-3">
          <h2 className="text-md font-medium">{t('spendersTitle')}</h2>
          <DataTable
            columns={columns}
            data={spenders}
            getRowId={(r) => r.address}
            pageSize={10}
          />
        </section>
      </div>
    </>
  )
}
