'use client'

import { useSyncExternalStore } from 'react'
import { keccak256, stringToHex } from 'viem'

export type OnPageRoll = {
  id: number
  owner: string
  filmId: number
  frames: number
  framesUsed: number
  /** unix seconds, 0 = not sent for developing */
  developReadyAt: number
  claimTxHash: `0x${string}`
}

const STORAGE_KEY = 'chainroll.rolls.v1'

let state: OnPageRoll[] | null = null
let hydratedFromApi = false
const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

function fetchRollsFromApi() {
  if (typeof window === 'undefined') return
  void fetch('/api/state', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { ok?: boolean; rolls?: OnPageRoll[] } | null) => {
      if (!data?.ok || !Array.isArray(data.rolls) || data.rolls.length === 0) return
      const cur = load()
      const byId = new Map<number, OnPageRoll>()
      for (const r of data.rolls) {
        byId.set(r.id, {
          ...r,
          owner: r.owner.toLowerCase(),
          claimTxHash: (r.claimTxHash ??
            keccak256(stringToHex(`chainroll:roll:${r.id}`))) as `0x${string}`,
        })
      }
      // Keep local rolls if they have equal or newer progress (higher framesUsed or developReadyAt)
      for (const local of cur) {
        const remote = byId.get(local.id)
        if (
          !remote ||
          local.framesUsed > remote.framesUsed ||
          local.developReadyAt > remote.developReadyAt
        ) {
          byId.set(local.id, local)
        }
      }
      state = [...byId.values()].sort((a, b) => b.id - a.id)
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch {
        // ignore storage quota errors
      }
      emit()
    })
    .catch(() => {
      // fallback to local state
    })
}

function hydrateFromApiOnce() {
  if (hydratedFromApi || typeof window === 'undefined') return
  hydratedFromApi = true
  fetchRollsFromApi()
  window.addEventListener('chainroll:wallet-connected', fetchRollsFromApi)
}

function syncRollToApi(payload: unknown) {
  if (typeof window === 'undefined') return
  void fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // local storage remains source of truth offline
  })
}

function load(): OnPageRoll[] {
  if (state) return state
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      state = []
      return state
    }
    const parsed = JSON.parse(raw) as OnPageRoll[]
    state = Array.isArray(parsed) ? parsed : []
    return state
  } catch {
    state = []
    return state
  }
}

function save(next: OnPageRoll[]) {
  state = next
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // ignore
    }
  }
  emit()
}

export function subscribeOnPageRolls(listener: () => void) {
  hydrateFromApiOnce()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getOnPageRollsSnapshot(): OnPageRoll[] {
  return load()
}

const SERVER_SNAPSHOT: OnPageRoll[] = []
export function getOnPageRollsServerSnapshot(): OnPageRoll[] {
  return SERVER_SNAPSHOT
}

export function useOnPageRolls(): OnPageRoll[] {
  return useSyncExternalStore(
    subscribeOnPageRolls,
    getOnPageRollsSnapshot,
    getOnPageRollsServerSnapshot,
  )
}

export function claimRollOnPage(
  owner: string,
  filmId: number,
  frames: number,
): { roll: OnPageRoll; txHash: `0x${string}` } {
  const cur = load()
  const maxId = cur.reduce((m, r) => Math.max(m, r.id), 100)
  const id = maxId + 1
  const txHash = keccak256(stringToHex(`chainroll:claim:${owner}:${id}:${Date.now()}`))
  const nextRoll: OnPageRoll = {
    id,
    owner: owner.toLowerCase(),
    filmId,
    frames,
    framesUsed: 0,
    developReadyAt: 0,
    claimTxHash: txHash,
  }
  save([nextRoll, ...cur])
  syncRollToApi({
    type: 'roll.claim',
    roll: {
      id,
      owner: owner.toLowerCase(),
      filmId,
      frames,
      txHash,
    },
  })
  return { roll: nextRoll, txHash }
}

export function shootFrameOnPage(
  rollId: bigint,
  photoHash: `0x${string}`,
  fallbackOwner?: string,
  fallbackFilmId = 1,
  fallbackFrames = 24,
): { txHash: `0x${string}`; frame: number } {
  const idNum = Number(rollId)
  const cur = load()
  const existing = cur.find((r) => r.id === idNum)
  const frame = existing ? Math.min(existing.frames, existing.framesUsed + 1) : 1
  const txHash = keccak256(stringToHex(`chainroll:shoot:${idNum}:${frame}:${photoHash}:${Date.now()}`))

  if (existing) {
    save(
      cur.map((r) =>
        r.id === idNum
          ? {
              ...r,
              framesUsed: frame,
            }
          : r,
      ),
    )
  } else if (fallbackOwner) {
    const created: OnPageRoll = {
      id: idNum,
      owner: fallbackOwner.toLowerCase(),
      filmId: fallbackFilmId,
      frames: fallbackFrames,
      framesUsed: frame,
      developReadyAt: 0,
      claimTxHash: txHash,
    }
    save([created, ...cur])
  }

  syncRollToApi({
    type: 'roll.shoot',
    rollId: idNum,
    frame,
    photoHash,
    txHash,
  })
  return { txHash, frame }
}

export function developRollOnPage(
  rollId: bigint,
  early: boolean,
  delaySec = 15,
): { txHash: `0x${string}`; readyAt: number; frames: number } {
  const idNum = Number(rollId)
  const cur = load()
  const target = cur.find((r) => r.id === idNum)
  const readyAt = Math.floor(Date.now() / 1000) + delaySec
  const nextFrames =
    early && target && target.framesUsed > 0 ? target.framesUsed : (target?.frames ?? 24)
  const txHash = keccak256(stringToHex(`chainroll:develop:${idNum}:${readyAt}:${Date.now()}`))

  save(
    cur.map((r) =>
      r.id === idNum
        ? {
            ...r,
            frames: nextFrames,
            developReadyAt: readyAt,
          }
        : r,
    ),
  )

  syncRollToApi({
    type: 'roll.develop',
    rollId: idNum,
    frames: nextFrames,
    readyAtSec: readyAt,
  })
  return { txHash, readyAt, frames: nextFrames }
}
