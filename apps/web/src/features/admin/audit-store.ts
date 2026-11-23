'use client'

import { useSyncExternalStore } from 'react'
import {
  initialAuditLog,
  initialModerationQueue,
  type AuditCategory,
  type AuditEntry,
  type ModerationDecision,
  type ModerationItem,
} from './mock-data'

type AdminState = {
  audit: AuditEntry[]
  moderation: ModerationItem[]
}

let state: AdminState = {
  audit: initialAuditLog,
  moderation: initialModerationQueue,
}

const listeners = new Set<() => void>()
let hydrated = false

function hydrateOnce() {
  if (hydrated || typeof window === 'undefined' || typeof window.fetch !== 'function') return
  hydrated = true
  void window
    .fetch('/api/state', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { ok?: boolean; audit?: AuditEntry[] } | null) => {
      if (data?.ok && Array.isArray(data.audit) && data.audit.length > 0) {
        state = { ...state, audit: data.audit }
        emit()
      }
    })
    .catch(() => {})
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

export function setModerationDecision(id: string, status: ModerationDecision) {
  state = {
    ...state,
    moderation: state.moderation.map((m) => (m.id === id ? { ...m, status } : m)),
  }
  emit()
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
