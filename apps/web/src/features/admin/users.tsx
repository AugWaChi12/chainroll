'use client'

import { useWallet } from '@/features/wallet'
import {
  Badge,
  Button,
  DataTable,
  Input,
  PageHeader,
  RebateLabel,
  TxHash,
  truncateHash,
  type ColumnDef,
} from '@chainroll/ui'
import { Ban, Check, Download, Flame, Gift, RotateCcw } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { downloadCsv, recordAudit } from './audit-store'
import { initialUsers, type AdminUserRow } from './mock-data'

const DEFAULT_ACTOR = '0x243d78f9c2a0114e9b6c88a12f00431d9a4c9350'

export function AdminUsers() {
  const t = useTranslations('admin.users')
  const format = useFormatter()
  const { address: adminAddress } = useWallet()

  const [users, setUsers] = useState<AdminUserRow[]>(initialUsers)
  const [selectedAddr, setSelectedAddr] = useState<string>(initialUsers[0]!.address)
  const [reason, setReason] = useState<string>('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const selected = useMemo(
    () => users.find((u) => u.address === selectedAddr) ?? users[0]!,
    [users, selectedAddr],
  )

  const toggleBan = (user: AdminUserRow) => {
    const nextStatus = user.status === 'banned' ? 'active' : 'banned'
    setUsers((prev) =>
      prev.map((u) => (u.address === user.address ? { ...u, status: nextStatus } : u)),
    )
    recordAudit({
      actor: adminAddress ?? DEFAULT_ACTOR,
      category: 'users',
      action: nextStatus === 'banned' ? 'user.ban' : 'user.unban',
      target: user.handle ? `${user.handle} (${truncateHash(user.address)})` : user.address,
      detail: reason.trim() || t(`defaultReason.${nextStatus}`),
    })
    setReason('')
    setFeedback(t(`feedback.${nextStatus}`, { user: user.handle ?? truncateHash(user.address) }))
  }

  const resetStreak = (user: AdminUserRow) => {
    setUsers((prev) => prev.map((u) => (u.address === user.address ? { ...u, streak: 0 } : u)))
    recordAudit({
      actor: adminAddress ?? DEFAULT_ACTOR,
      category: 'users',
      action: 'user.reset_streak',
      target: user.handle ?? user.address,
      detail: `Streak reset from ${user.streak} to 0`,
    })
    setFeedback(t('feedback.streakReset', { user: user.handle ?? truncateHash(user.address) }))
  }

  const grantRoll = (user: AdminUserRow) => {
    setUsers((prev) =>
      prev.map((u) => (u.address === user.address ? { ...u, rolls: u.rolls + 1 } : u)),
    )
    recordAudit({
      actor: adminAddress ?? DEFAULT_ACTOR,
      category: 'users',
      action: 'user.grant_roll',
      target: user.handle ?? user.address,
      detail: reason.trim() || 'Bonus 24-frame roll granted by admin',
    })
    setReason('')
    setFeedback(t('feedback.rollGranted', { user: user.handle ?? truncateHash(user.address) }))
  }

  const columns = useMemo<ColumnDef<AdminUserRow, unknown>[]>(
    () => [
      {
        id: 'user',
        accessorFn: (r) => `${r.handle ?? ''} ${r.address}`,
        header: t('cols.user'),
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
        accessorKey: 'rolls',
        header: t('cols.rolls'),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs tabular">{format.number(Number(getValue()))}</span>
        ),
      },
      {
        accessorKey: 'shots',
        header: t('cols.shots'),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs tabular">{format.number(Number(getValue()))}</span>
        ),
      },
      {
        accessorKey: 'posts',
        header: t('cols.posts'),
        cell: ({ getValue }) => (
          <span className="font-mono text-xs tabular">{format.number(Number(getValue()))}</span>
        ),
      },
      {
        accessorKey: 'streak',
        header: t('cols.streak'),
        cell: ({ getValue }) => (
          <span className="inline-flex items-center gap-1 font-mono text-xs tabular text-frame">
            <Flame className="size-3" />
            {String(getValue())}d
          </span>
        ),
      },
      {
        accessorKey: 'reports',
        header: t('cols.reports'),
        cell: ({ getValue }) => {
          const count = Number(getValue())
          return (
            <span
              className={
                count > 0 ? 'font-mono text-xs tabular text-danger' : 'font-mono text-xs text-fg-subtle'
              }
            >
              {count}
            </span>
          )
        },
      },
      {
        accessorKey: 'status',
        header: t('cols.status'),
        cell: ({ getValue }) => {
          const s = getValue() as AdminUserRow['status']
          return (
            <Badge tone={s === 'active' ? 'success' : 'danger'} dot>
              {t(`status.${s}`)}
            </Badge>
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
                'chainroll-users.csv',
                ['address', 'handle', 'wallet', 'rolls', 'shots', 'posts', 'streak', 'reports', 'status'],
                users.map((u) => [
                  u.address,
                  u.handle,
                  u.wallet,
                  u.rolls,
                  u.shots,
                  u.posts,
                  u.streak,
                  u.reports,
                  u.status,
                ]),
              )
            }
          >
            <Download />
            {t('export')}
          </Button>
        }
      />

      <div className="grid gap-6 px-4 py-6 md:px-8 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <DataTable
            columns={columns}
            data={users}
            getRowId={(r) => r.address}
            pageSize={10}
            onRowClick={(row) => {
              setSelectedAddr(row.address)
              setFeedback(null)
            }}
          />
        </div>

        {/* User Inspector */}
        <aside className="flex flex-col gap-4 self-start border border-border bg-bg-raised p-4 md:p-5 lg:col-span-4">
          <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
            <div className="flex flex-col gap-1">
              <RebateLabel>{t('inspector')}</RebateLabel>
              <h2 className="font-display text-xl text-fg">
                {selected.handle ?? truncateHash(selected.address)}
              </h2>
              <TxHash hash={selected.address} />
            </div>
            <Badge tone={selected.status === 'active' ? 'success' : 'danger'} dot>
              {t(`status.${selected.status}`)}
            </Badge>
          </div>

          <dl className="grid grid-cols-2 gap-px border border-border bg-border font-mono text-xs">
            <div className="flex flex-col gap-0.5 bg-bg p-2.5">
              <dt className="text-2xs text-fg-subtle">{t('cols.wallet')}</dt>
              <dd className="text-fg">
                {selected.wallet === 'bitkub-next' ? 'Bitkub NEXT' : 'MetaMask'}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 bg-bg p-2.5">
              <dt className="text-2xs text-fg-subtle">{t('cols.streak')}</dt>
              <dd className="text-frame">{selected.streak}d</dd>
            </div>
            <div className="flex flex-col gap-0.5 bg-bg p-2.5">
              <dt className="text-2xs text-fg-subtle">{t('cols.shots')}</dt>
              <dd className="text-fg">
                {format.number(selected.shots)} ({selected.rolls} {t('cols.rolls')})
              </dd>
            </div>
            <div className="flex flex-col gap-0.5 bg-bg p-2.5">
              <dt className="text-2xs text-fg-subtle">{t('cols.reports')}</dt>
              <dd className={selected.reports > 0 ? 'text-danger' : 'text-fg'}>
                {selected.reports}
              </dd>
            </div>
          </dl>

          <Input
            label={t('reasonLabel')}
            placeholder={t('reasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />

          {feedback && (
            <p className="border-l-2 border-frame bg-bg px-3 py-2 text-xs text-fg">{feedback}</p>
          )}

          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <Button variant="secondary" size="sm" onClick={() => grantRoll(selected)}>
              <Gift />
              {t('actions.grantRoll')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={selected.streak === 0}
              onClick={() => resetStreak(selected)}
            >
              <RotateCcw />
              {t('actions.resetStreak')}
            </Button>
            <Button
              variant={selected.status === 'banned' ? 'secondary' : 'danger'}
              size="sm"
              onClick={() => toggleBan(selected)}
            >
              {selected.status === 'banned' ? <Check /> : <Ban />}
              {selected.status === 'banned' ? t('actions.unban') : t('actions.ban')}
            </Button>
          </div>
        </aside>
      </div>
    </>
  )
}
