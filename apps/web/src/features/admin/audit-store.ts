'use client'

import { useSyncExternalStore } from 'react'
import {
  initialAuditLog,
  initialModerationQueue,
  initialUsers,
  kpis as seedKpis,
  recentShots as seedRecentShots,
  type AdminUserRow,
  type AuditCategory,
  type AuditEntry,
  type ModerationDecision,
  type ModerationItem,
  type ShotRow,
} from './mock-data'

export type LiveAdminKpis = {
  shotsToday: number
  shotsTotal: number
  txFailed: number
  activeUsers: number
  openReports: number
  hiddenPosts: number
}

type AdminState = {
  dbConnected: boolean
  loading: boolean
  kpis: LiveAdminKpis
  recentShots: ShotRow[]
  audit: AuditEntry[]
  moderation: ModerationItem[]
  users: AdminUserRow[]
}

let state: AdminState = {
  dbConnected: false,
  loading: false,
  kpis: {
    shotsToday: seedKpis.shots.value,
    shotsTotal: seedKpis.shots.value,
    txFailed: seedKpis.txFailed.value,
    activeUsers: seedKpis.activeUsers.value,
    openReports: initialModerationQueue.filter((m) => m.status === 'pending').length,
    hiddenPosts: 0,
  },
  recentShots: seedRecentShots,
  audit: initialAuditLog,
  moderation: initialModerationQueue,
  users: initialUsers,
}

const listeners = new Set<() => void>()
let hydrated = false

type AdminApiResponse = {
  ok?: boolean
  kpis?: LiveAdminKpis
  recentShots?: {
    id: string
    frame: string
    shooter: string
    handle: string | null
    film: string
    wallet: 'bitkub-next' | 'metamask'
    txHash: string
    status: 'confirmed' | 'pending' | 'failed'
    minutesAgo: number
  }[]
  moderation?: {
    id: string
    postId: string
    frame: string
    filmId: number
    film: string
    scene: ModerationItem['scene']
    imageUrl: string | null
    shooter: string
    handle: string | null
    caption: string
    photoHash: string
    reason: ModerationItem['reason']
    confidence: number | null
    reporter: string
    reportCount: number
    minutesAgo: number
    status: ModerationDecision
  }[]
  users?: {
    address: string
    handle: string | null
    wallet: 'bitkub-next' | 'metamask'
    rolls: number
    shots: number
    posts: number
    streak: number
    reports: number
    status: 'active' | 'banned'
    lastActiveMinutes: number
  }[]
}

export function refreshAdminDashboard(): Promise<void> {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    return Promise.resolve()
  }
  state = { ...state, loading: true }
  emit()

  return Promise.all([
    window
      .fetch('/api/admin', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<AdminApiResponse>) : null))
      .catch(() => null),
    window
      .fetch('/api/state', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<{ ok?: boolean; audit?: AuditEntry[] }>) : null))
      .catch(() => null),
  ]).then(([adminData, stateData]) => {
    let nextState = { ...state, loading: false }

    if (adminData?.ok) {
      nextState = {
        ...nextState,
        dbConnected: true,
        kpis: adminData.kpis ?? nextState.kpis,
        recentShots: Array.isArray(adminData.recentShots)
          ? adminData.recentShots.map((r) => ({
              ...r,
              wallet: r.wallet === 'bitkub-next' ? 'bitkub-next' : 'injected',
            }))
          : nextState.recentShots,
        moderation: Array.isArray(adminData.moderation)
          ? adminData.moderation.map((m) => ({
              ...m,
              source: m.confidence !== null ? 'ai' : 'report',
            }))
          : nextState.moderation,
        users: Array.isArray(adminData.users)
          ? adminData.users.map((u) => ({
              address: u.address,
              handle: u.handle,
              wallet: u.wallet === 'bitkub-next' ? 'bitkub-next' : 'injected',
              rolls: u.rolls,
              shots: u.shots,
              posts: u.posts,
              streak: u.streak,
              reports: u.reports,
              status: u.status,
              joinedDaysAgo: Math.max(1, Math.round(u.lastActiveMinutes / 1440)),
            }))
          : nextState.users,
      }
    }

    if (stateData?.ok && Array.isArray(stateData.audit)) {
      nextState = { ...nextState, audit: stateData.audit }
    }

    state = nextState
    emit()
  })
}

function hydrateOnce() {
  if (hydrated || typeof window === 'undefined' || typeof window.fetch !== 'function') return
  hydrated = true
  void refreshAdminDashboard()
}

function syncAuditToDb(payload: unknown) {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return
  void window
    .fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    .catch(() => {})
}

function syncAdminActionToDb(payload: unknown) {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return
  void window
    .fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    .catch(() => {})
}

function emit() {
  for (const fn of listeners) fn()
}

function subscribe(listener: () => void) {
  hydrateOnce()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return state
}

export function useAdminStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function recordAudit(entry: {
  actor: string
  category: AuditCategory
  action: string
  target: string
  detail: string
  txHash?: string
}): string {
  const id = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const next: AuditEntry = {
    id,
    actor: entry.actor,
    category: entry.category,
    action: entry.action,
    target: entry.target,
    detail: entry.detail,
    txHash: entry.txHash,
    minutesAgo: 0,
  }
  state = { ...state, audit: [next, ...state.audit] }
  emit()
  syncAuditToDb({ type: 'audit.record', entry: next })
  return id
}

export function removeAudit(id: string) {
  state = { ...state, audit: state.audit.filter((a) => a.id !== id) }
  emit()
  syncAuditToDb({ type: 'audit.remove', id })
}

export function setModerationDecision(
  id: string,
  status: ModerationDecision,
  note?: string,
) {
  const target = state.moderation.find((m) => m.id === id)
  const nextModeration = state.moderation.map((m) => (m.id === id ? { ...m, status } : m))
  const openReports = nextModeration.filter((m) => m.status === 'pending').length

  state = {
    ...state,
    moderation: nextModeration,
    kpis: { ...state.kpis, openReports },
    users:
      status === 'banned' && target
        ? state.users.map((u) =>
            u.address.toLowerCase() === target.shooter.toLowerCase()
              ? { ...u, status: 'banned' }
              : u,
          )
        : state.users,
  }
  emit()

  if (target) {
    syncAdminActionToDb({
      type: 'moderation.decide',
      reportId: target.id,
      postId: target.postId,
      shooter: target.shooter,
      decision: status,
      note,
    })
  }
}

export function bulkHidePosts(postIds: string[], actor: string) {
  if (postIds.length === 0) return
  const idSet = new Set(postIds)
  state = {
    ...state,
    recentShots: state.recentShots.map((r) => (idSet.has(r.id) ? { ...r, status: 'failed' } : r)),
    kpis: { ...state.kpis, hiddenPosts: state.kpis.hiddenPosts + postIds.length },
  }
  emit()

  syncAdminActionToDb({
    type: 'post.bulkHide',
    postIds,
  })
  recordAudit({
    actor,
    category: 'moderation',
    action: 'post.bulk_hide',
    target: `${postIds.length} posts`,
    detail: postIds.join(', '),
  })
}

export function setAdminUserBan(address: string, banned: boolean, note?: string) {
  const norm = address.toLowerCase()
  state = {
    ...state,
    users: state.users.map((u) =>
      u.address.toLowerCase() === norm ? { ...u, status: banned ? 'banned' : 'active' } : u,
    ),
  }
  emit()
  syncAdminActionToDb({
    type: 'user.setBan',
    address: norm,
    banned,
    note,
  })
}

export function resetAdminUserStreak(address: string) {
  const norm = address.toLowerCase()
  state = {
    ...state,
    users: state.users.map((u) => (u.address.toLowerCase() === norm ? { ...u, streak: 0 } : u)),
  }
  emit()
  syncAdminActionToDb({
    type: 'user.resetStreak',
    address: norm,
  })
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
