'use client'

import type { SampleSceneKind } from '@/features/film'
import { useSyncExternalStore } from 'react'

export type FeedReportReason = 'nsfw' | 'spam' | 'copyright' | 'harassment'

export type FeedReport = {
  reporter: string
  reason: FeedReportReason
  note?: string
  createdAt: number
}

export type FeedPost = {
  id: string
  shooter: string
  handle: string | null
  rollId: number
  frame: number
  filmId: number
  photoHash: string
  txHash?: string
  caption: string
  createdAt: number
  baseLikes: number
  likes: string[]
  imageDataUrl?: string
  scene?: SampleSceneKind
  featured?: boolean
  reports: FeedReport[]
}

export type UserProfileMeta = {
  address: string
  handle: string | null
  bio: string
  updatedAt: number
}

const STORAGE_KEY = 'chainroll.feed.posts.v1'
const PROFILES_KEY = 'chainroll.feed.profiles.v1'

function hex(seed: number, len: number) {
  let s = seed
  let out = ''
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff
    out += ((s >>> 16) % 16).toString(16)
  }
  return out
}

const REF_TIME = Date.UTC(2026, 10, 22, 12, 0, 0)

export const SEED_POSTS: FeedPost[] = [
  {
    id: 'p-101',
    shooter: `0x${hex(700, 40)}`,
    handle: 'ploy.shoots',
    rollId: 14,
    frame: 7,
    filmId: 1,
    photoHash: `0x${hex(2101, 64)}`,
    txHash: `0x${hex(3101, 64)}`,
    caption: 'แสงเย็นริมแม่น้ำเจ้าพระยา รอเรือข้ามฟากเที่ยวสุดท้ายของวัน',
    createdAt: REF_TIME - 38 * 60_000,
    baseLikes: 42,
    likes: [],
    scene: 'nature',
    featured: true,
    reports: [],
  },
  {
    id: 'p-102',
    shooter: `0x${hex(702, 40)}`,
    handle: 'bank_35mm',
    rollId: 11,
    frame: 19,
    filmId: 2,
    photoHash: `0x${hex(2102, 64)}`,
    txHash: `0x${hex(3102, 64)}`,
    caption: 'เงาพาดกำแพงตึกแถวเจริญกรุง เที่ยงตรงแดดจัด',
    createdAt: REF_TIME - 115 * 60_000,
    baseLikes: 29,
    likes: [],
    scene: 'portrait',
    featured: false,
    reports: [],
  },
  {
    id: 'p-103',
    shooter: `0x${hex(707, 40)}`,
    handle: 'oat.charoenkrung',
    rollId: 16,
    frame: 23,
    filmId: 3,
    photoHash: `0x${hex(2103, 64)}`,
    txHash: `0x${hex(3103, 64)}`,
    caption: 'ป้ายไฟร้านบะหมี่หลังฝนหยุด 800 เอาอยู่ทุกซอย',
    createdAt: REF_TIME - 240 * 60_000,
    baseLikes: 64,
    likes: [],
    scene: 'night',
    featured: false,
    reports: [],
  },
  {
    id: 'p-104',
    shooter: `0x${hex(703, 40)}`,
    handle: 'nong.film',
    rollId: 9,
    frame: 4,
    filmId: 1,
    photoHash: `0x${hex(2104, 64)}`,
    txHash: `0x${hex(3104, 64)}`,
    caption: 'กาแฟแก้วแรกก่อนเริ่มงาน โต๊ะไม้ริมหน้าต่างบานเดิม',
    createdAt: REF_TIME - 410 * 60_000,
    baseLikes: 18,
    likes: [],
    scene: 'indoor',
    featured: false,
    reports: [],
  },
  {
    id: 'p-105',
    shooter: `0x${hex(700, 40)}`,
    handle: 'ploy.shoots',
    rollId: 12,
    frame: 24,
    filmId: 3,
    photoHash: `0x${hex(2105, 64)}`,
    txHash: `0x${hex(3105, 64)}`,
    caption: 'เฟรมสุดท้ายของม้วนที่สถานีหัวลำโพง',
    createdAt: REF_TIME - 760 * 60_000,
    baseLikes: 51,
    likes: [],
    scene: 'night',
    featured: true,
    reports: [],
  },
  {
    id: 'p-106',
    shooter: `0x${hex(705, 40)}`,
    handle: 'tee.k',
    rollId: 8,
    frame: 12,
    filmId: 2,
    photoHash: `0x${hex(2106, 64)}`,
    txHash: `0x${hex(3106, 64)}`,
    caption: 'ขาวดำเกรนหนัก ๆ ล้างเสร็จแล้วคุ้มที่รอหนึ่งชั่วโมง',
    createdAt: REF_TIME - 1320 * 60_000,
    baseLikes: 33,
    likes: [],
    scene: 'portrait',
    featured: false,
    reports: [],
  },
]

const KNOWN_HANDLES: Record<string, string> = {
  ...Object.fromEntries(
    SEED_POSTS.filter((p) => p.handle).map((p) => [p.shooter.toLowerCase(), p.handle!]),
  ),
  [`0x${hex(706, 40)}`.toLowerCase()]: 'mint_roll',
  [`0x${hex(709, 40)}`.toLowerCase()]: 'ken.bkk',
}

const SEED_BIOS: Record<string, string> = {
  'ploy.shoots': 'ถ่ายแสงเช้ากับแม่น้ำเจ้าพระยา · ชอบ KUB 400 กับ Night 800',
  bank_35mm: 'ขาวดำ 35mm รอบเจริญกรุง–ทรงวาด · เกรนหนักคือชีวิต',
  'oat.charoenkrung': 'เดินถ่ายไฟนีออนตอนดึกหลังเลิกงาน · สะสม 1/1 Prints',
  'nong.film': 'บันทึกคาเฟ่และโต๊ะทำงานวันละแชะ',
  'tee.k': 'พอร์ตเทรตหลังเวทีดนตรี · ล้างฟิล์มเองทุกสุดสัปดาห์',
  mint_roll: 'นักสะสมภาพฟิล์ม 1/1 บน KUB Chain',
  'ken.bkk': 'Street photography & analog print collector · Bangkok',
}

type FeedState = {
  posts: FeedPost[]
  profiles: Record<string, UserProfileMeta>
}

const initialProfiles: Record<string, UserProfileMeta> = Object.fromEntries(
  Object.entries(KNOWN_HANDLES).map(([addr, handle]) => [
    addr,
    {
      address: addr,
      handle,
      bio: SEED_BIOS[handle] ?? '',
      updatedAt: REF_TIME,
    },
  ]),
)

let state: FeedState = {
  posts: SEED_POSTS,
  profiles: initialProfiles,
}

let hydrated = false

function hydrateOnce() {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as FeedPost[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        state = { ...state, posts: parsed }
      }
    }
    const rawProfiles = window.localStorage.getItem(PROFILES_KEY)
    if (rawProfiles) {
      const parsedProfiles = JSON.parse(rawProfiles) as Record<string, UserProfileMeta>
      if (parsedProfiles && typeof parsedProfiles === 'object') {
        state = { ...state, profiles: { ...initialProfiles, ...parsedProfiles } }
      }
    }
  } catch {
    /* ignore storage errors */
  }

  // Sync live state from Docker Postgres / Supabase via /api/state
  const pullFromApi = () => {
    if (typeof window.fetch !== 'function') return
    void window
      .fetch('/api/state', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            ok?: boolean
            posts?: FeedPost[]
            profiles?: Record<string, UserProfileMeta>
          } | null,
        ) => {
          if (!data?.ok) return
          if (Array.isArray(data.posts) && data.posts.length > 0) {
            state = {
              posts: data.posts,
              profiles: { ...state.profiles, ...(data.profiles ?? {}) },
            }
            persist()
            emit()
          }
        },
      )
      .catch(() => {})
  }
  pullFromApi()
  window.addEventListener('chainroll:wallet-connected', pullFromApi)
}

function syncToDb(payload: unknown) {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return
  void window
    .fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    .catch(() => {})
}

function persist() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.posts))
    window.localStorage.setItem(PROFILES_KEY, JSON.stringify(state.profiles))
  } catch {
    /* quota exceeded or private mode — keep in memory */
  }
}

const listeners = new Set<() => void>()

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

export function useFeedStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function handleForAddress(address: string): string | null {
  const norm = address.toLowerCase()
  return state.profiles[norm]?.handle ?? KNOWN_HANDLES[norm] ?? null
}

export function getProfileMeta(address: string): UserProfileMeta {
  const norm = address.toLowerCase()
  return (
    state.profiles[norm] ?? {
      address,
      handle: KNOWN_HANDLES[norm] ?? null,
      bio: '',
      updatedAt: 0,
    }
  )
}

export function saveProfileMeta(input: {
  address: string
  handle: string
  bio: string
}): { ok: true; profile: UserProfileMeta } | { ok: false; reason: 'invalid' | 'taken' } {
  hydrateOnce()
  const norm = input.address.toLowerCase()
  const cleanHandle = input.handle.trim().replace(/^@/, '').toLowerCase()
  if (cleanHandle && !/^[a-z0-9._-]{2,24}$/.test(cleanHandle)) {
    return { ok: false, reason: 'invalid' }
  }
  if (cleanHandle) {
    const conflict = Object.entries(state.profiles).find(
      ([addr, meta]) => addr !== norm && meta.handle?.toLowerCase() === cleanHandle,
    )
    if (conflict) return { ok: false, reason: 'taken' }
  }

  const nextHandle = cleanHandle || null
  const profile: UserProfileMeta = {
    address: input.address,
    handle: nextHandle,
    bio: input.bio.trim().slice(0, 160),
    updatedAt: Date.now(),
  }

  state = {
    profiles: { ...state.profiles, [norm]: profile },
    posts: state.posts.map((p) =>
      p.shooter.toLowerCase() === norm ? { ...p, handle: nextHandle } : p,
    ),
  }
  persist()
  emit()
  syncToDb({
    type: 'profile.save',
    address: input.address,
    handle: nextHandle,
    bio: profile.bio,
  })
  return { ok: true, profile }
}

export function frameMark(frame: number): string {
  return `${String(frame).padStart(2, '0')}${frame % 2 ? 'A' : ''}`
}

export function likeCountOf(post: FeedPost): number {
  return post.baseLikes + post.likes.length
}

export function isLikedBy(post: FeedPost, address: string | null | undefined): boolean {
  if (!address) return false
  const norm = address.toLowerCase()
  return post.likes.includes(norm)
}

export function createPost(input: {
  shooter: string
  rollId: number
  frame: number
  filmId: number
  photoHash: string
  txHash?: string
  caption: string
  imageDataUrl?: string
  scene?: SampleSceneKind
}): FeedPost {
  hydrateOnce()
  const existing = state.posts.find(
    (p) => p.photoHash.toLowerCase() === input.photoHash.toLowerCase(),
  )
  if (existing) {
    const updated: FeedPost = {
      ...existing,
      caption: input.caption.trim(),
      imageDataUrl: input.imageDataUrl ?? existing.imageDataUrl,
    }
    state = {
      ...state,
      posts: state.posts.map((p) => (p.id === existing.id ? updated : p)),
    }
    persist()
    emit()
    syncToDb({ type: 'post.create', post: updated })
    return updated
  }

  const id = `p-${input.photoHash.replace(/^0x/, '').slice(0, 8).toLowerCase()}`
  const post: FeedPost = {
    id,
    shooter: input.shooter,
    handle: handleForAddress(input.shooter),
    rollId: input.rollId,
    frame: input.frame,
    filmId: input.filmId,
    photoHash: input.photoHash,
    txHash: input.txHash,
    caption: input.caption.trim(),
    createdAt: Date.now(),
    baseLikes: 0,
    likes: [],
    imageDataUrl: input.imageDataUrl,
    scene: input.scene ?? 'nature',
    featured: true,
    reports: [],
  }
  state = { ...state, posts: [post, ...state.posts] }
  persist()
  emit()
  syncToDb({ type: 'post.create', post })
  return post
}

export function toggleLike(postId: string, userAddress: string) {
  hydrateOnce()
  const norm = userAddress.toLowerCase()
  state = {
    ...state,
    posts: state.posts.map((p) => {
      if (p.id !== postId) return p
      const has = p.likes.includes(norm)
      return {
        ...p,
        likes: has ? p.likes.filter((a) => a !== norm) : [...p.likes, norm],
      }
    }),
  }
  persist()
  emit()
  syncToDb({ type: 'post.like', postId, userAddress })
}

export function deletePost(postId: string, actorAddress: string): boolean {
  hydrateOnce()
  const target = state.posts.find((p) => p.id === postId)
  if (!target || target.shooter.toLowerCase() !== actorAddress.toLowerCase()) return false
  state = { ...state, posts: state.posts.filter((p) => p.id !== postId) }
  persist()
  emit()
  syncToDb({ type: 'post.delete', postId, actorAddress })
  return true
}

export function reportPost(
  postId: string,
  reporterAddress: string,
  reason: FeedReportReason,
  note?: string,
) {
  hydrateOnce()
  state = {
    ...state,
    posts: state.posts.map((p) =>
      p.id === postId
        ? {
            ...p,
            reports: [
              ...p.reports,
              {
                reporter: reporterAddress,
                reason,
                note: note?.trim() || undefined,
                createdAt: Date.now(),
              },
            ],
          }
        : p,
    ),
  }
  persist()
  emit()
  syncToDb({ type: 'post.report', postId, reporter: reporterAddress, reason, note })
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })
}
