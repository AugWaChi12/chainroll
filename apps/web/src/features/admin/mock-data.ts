/**
 * Deterministic seed data for Darkroom Console (M5).
 * No lorem / "John Doe" (§9.8) — uses realistic Thai photographer handles and on-chain hashes.
 */

import type { SampleSceneKind } from '@/features/film'

export type ShotRow = {
  id: string
  frame: string
  shooter: string
  handle: string | null
  film: string
  wallet: 'bitkub-next' | 'injected'
  txHash: string
  status: 'confirmed' | 'pending' | 'failed'
  minutesAgo: number
}

export type ModerationReason = 'nsfw' | 'spam' | 'copyright' | 'harassment'
export type ModerationDecision = 'pending' | 'approved' | 'hidden' | 'banned'

export type ModerationItem = {
  id: string
  postId: string
  frame: string
  filmId: number
  film: string
  scene: SampleSceneKind
  imageUrl?: string | null
  shooter: string
  handle: string | null
  caption: string
  source: 'report' | 'ai'
  reason: ModerationReason
  /** AI classifier confidence 0..100 when flagged by AI */
  confidence: number | null
  reportCount: number
  reporter: string
  photoHash: string
  minutesAgo: number
  status: ModerationDecision
}

export type AdminUserRow = {
  address: string
  handle: string | null
  wallet: 'bitkub-next' | 'injected'
  shots: number
  rolls: number
  posts: number
  streak: number
  reports: number
  status: 'active' | 'banned'
  joinedDaysAgo: number
}

export type SpenderRow = {
  address: string
  handle: string | null
  wallet: 'bitkub-next' | 'injected'
  txToday: number
  txPerMin: number
  kubSpent: number
  status: 'normal' | 'flagged' | 'limited'
}

export type AuditCategory = 'moderation' | 'films' | 'users' | 'gas' | 'contract'

export type AuditEntry = {
  id: string
  actor: string
  category: AuditCategory
  action: string
  target: string
  detail: string
  txHash?: string
  minutesAgo: number
}

const FILMS = ['KUB 400', 'Mono 400', 'Night 800']
const HANDLES = [
  'ploy.shoots',
  null,
  'bank_35mm',
  'nong.film',
  null,
  'tee.k',
  'mint_roll',
  'oat.charoenkrung',
  'fah_analog',
  'ken.bkk',
]

export function hex(seed: number, len: number) {
  let s = seed
  let out = ''
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff
    out += ((s >>> 16) % 16).toString(16)
  }
  return out
}

export const recentShots: ShotRow[] = Array.from({ length: 46 }, (_, i) => {
  const status: ShotRow['status'] = i % 17 === 5 ? 'failed' : i < 3 ? 'pending' : 'confirmed'
  return {
    id: `shot-${i}`,
    frame: `${String((i % 24) + 1).padStart(2, '0')}${i % 2 ? 'A' : ''}`,
    shooter: `0x${hex(i + 7, 40)}`,
    handle: HANDLES[i % HANDLES.length] ?? null,
    film: FILMS[i % FILMS.length] ?? 'KUB 400',
    wallet: i % 3 === 0 ? 'injected' : 'bitkub-next',
    txHash: `0x${hex(i + 101, 64)}`,
    status,
    minutesAgo: i * 3 + 1,
  }
})

export const kpis = {
  shots: { value: 12_480, delta: 0.124, trend: [6.1, 7.4, 6.8, 8.2, 9.9, 11.1, 12.5] },
  txFailed: { value: 37, delta: 0.08, trend: [52, 48, 41, 44, 30, 34, 37] },
  activeUsers: { value: 1_906, delta: 0.041, trend: [1.2, 1.4, 1.5, 1.5, 1.7, 1.8, 1.9] },
  openReports: { value: 7, delta: -0.3 },
  relayer: { balance: 184.2, burnPerDay: 71.5 },
}

export const initialModerationQueue: ModerationItem[] = [
  {
    id: 'mod-101',
    postId: 'post-884',
    frame: '14A',
    filmId: 3,
    film: 'Night 800',
    scene: 'night',
    shooter: `0x${hex(301, 40)}`,
    handle: 'neon_yaowarat',
    caption: 'ไฟนีออนเยาวราช ตีสอง ฝนเพิ่งหยุดตก',
    source: 'ai',
    reason: 'nsfw',
    confidence: 84,
    reportCount: 1,
    reporter: `0x${hex(401, 40)}`,
    photoHash: `0x${hex(501, 64)}`,
    minutesAgo: 6,
    status: 'pending',
  },
  {
    id: 'mod-102',
    postId: 'post-879',
    frame: '03A',
    filmId: 1,
    film: 'KUB 400',
    scene: 'portrait',
    shooter: `0x${hex(302, 40)}`,
    handle: null,
    caption: 'แจกเหรียญฟรี คลิกลิงก์หน้าโปรไฟล์ด่วน',
    source: 'report',
    reason: 'spam',
    confidence: 96,
    reportCount: 5,
    reporter: `0x${hex(402, 40)}`,
    photoHash: `0x${hex(502, 64)}`,
    minutesAgo: 14,
    status: 'pending',
  },
  {
    id: 'mod-103',
    postId: 'post-871',
    frame: '21',
    filmId: 2,
    film: 'Mono 400',
    scene: 'indoor',
    shooter: `0x${hex(303, 40)}`,
    handle: 'bank_35mm',
    caption: 'ร้านกาแฟหัวมุมถนนทรงวาด แสงบ่ายสาม',
    source: 'report',
    reason: 'copyright',
    confidence: null,
    reportCount: 2,
    reporter: `0x${hex(403, 40)}`,
    photoHash: `0x${hex(503, 64)}`,
    minutesAgo: 28,
    status: 'pending',
  },
  {
    id: 'mod-104',
    postId: 'post-865',
    frame: '09A',
    filmId: 1,
    film: 'KUB 400',
    scene: 'nature',
    shooter: `0x${hex(304, 40)}`,
    handle: 'ploy.shoots',
    caption: 'หมอกเช้าที่เชียงดาว ม้วนแรกของสัปดาห์',
    source: 'ai',
    reason: 'nsfw',
    confidence: 61,
    reportCount: 0,
    reporter: 'AI Classifier v2',
    photoHash: `0x${hex(504, 64)}`,
    minutesAgo: 43,
    status: 'pending',
  },
  {
    id: 'mod-105',
    postId: 'post-859',
    frame: '18',
    filmId: 3,
    film: 'Night 800',
    scene: 'night',
    shooter: `0x${hex(305, 40)}`,
    handle: null,
    caption: 'ปั๊มฟอล รับปั่นยอดไลก์ ทักแชท',
    source: 'report',
    reason: 'spam',
    confidence: 92,
    reportCount: 4,
    reporter: `0x${hex(405, 40)}`,
    photoHash: `0x${hex(505, 64)}`,
    minutesAgo: 67,
    status: 'pending',
  },
  {
    id: 'mod-106',
    postId: 'post-852',
    frame: '11A',
    filmId: 2,
    film: 'Mono 400',
    scene: 'portrait',
    shooter: `0x${hex(306, 40)}`,
    handle: 'tee.k',
    caption: 'พอร์ตเทรตหลังเวทีคอนเสิร์ต',
    source: 'report',
    reason: 'harassment',
    confidence: null,
    reportCount: 2,
    reporter: `0x${hex(406, 40)}`,
    photoHash: `0x${hex(506, 64)}`,
    minutesAgo: 95,
    status: 'pending',
  },
  {
    id: 'mod-107',
    postId: 'post-844',
    frame: '24',
    filmId: 1,
    film: 'KUB 400',
    scene: 'indoor',
    shooter: `0x${hex(307, 40)}`,
    handle: 'nong.film',
    caption: 'เฟรมสุดท้ายของม้วน ล้างเสร็จพอดีเที่ยงคืน',
    source: 'ai',
    reason: 'nsfw',
    confidence: 58,
    reportCount: 0,
    reporter: 'AI Classifier v2',
    photoHash: `0x${hex(507, 64)}`,
    minutesAgo: 122,
    status: 'pending',
  },
]

export const initialUsers: AdminUserRow[] = Array.from({ length: 24 }, (_, i) => {
  const handle = HANDLES[i % HANDLES.length] ?? null
  const rolls = Math.max(1, 18 - (i % 11))
  return {
    address: `0x${hex(i + 700, 40)}`,
    handle: handle ? (i >= HANDLES.length ? `${handle}.${i}` : handle) : null,
    wallet: i % 3 === 0 ? 'injected' : 'bitkub-next',
    rolls,
    shots: rolls * 24 - (i % 9),
    posts: Math.max(0, Math.floor(rolls * 1.6) - (i % 4)),
    streak: i % 7 === 4 ? 0 : (i * 3 + 5) % 21,
    reports: i === 1 || i === 11 ? 4 : i % 5 === 0 ? 1 : 0,
    status: i === 11 ? 'banned' : 'active',
    joinedDaysAgo: i * 2 + 1,
  }
})

export const initialSpenders: SpenderRow[] = [
  {
    address: `0x${hex(901, 40)}`,
    handle: null,
    wallet: 'injected',
    txToday: 142,
    txPerMin: 8.4,
    kubSpent: 0.213,
    status: 'flagged',
  },
  {
    address: `0x${hex(902, 40)}`,
    handle: 'bot_grind_99',
    wallet: 'bitkub-next',
    txToday: 96,
    txPerMin: 5.1,
    kubSpent: 0.144,
    status: 'flagged',
  },
  {
    address: `0x${hex(903, 40)}`,
    handle: 'ploy.shoots',
    wallet: 'bitkub-next',
    txToday: 26,
    txPerMin: 0.9,
    kubSpent: 0.039,
    status: 'normal',
  },
  {
    address: `0x${hex(904, 40)}`,
    handle: 'bank_35mm',
    wallet: 'injected',
    txToday: 25,
    txPerMin: 0.7,
    kubSpent: 0.037,
    status: 'normal',
  },
  {
    address: `0x${hex(905, 40)}`,
    handle: 'oat.charoenkrung',
    wallet: 'bitkub-next',
    txToday: 24,
    txPerMin: 0.6,
    kubSpent: 0.036,
    status: 'normal',
  },
  {
    address: `0x${hex(906, 40)}`,
    handle: null,
    wallet: 'injected',
    txToday: 88,
    txPerMin: 4.6,
    kubSpent: 0.132,
    status: 'limited',
  },
]

export const initialAuditLog: AuditEntry[] = [
  {
    id: 'aud-1',
    actor: '0x243d78f9c2a0114e9b6c88a12f00431d9a4c9350',
    category: 'contract',
    action: 'contract.deploy',
    target: 'ChainRoll (0x8a4e…2ED5)',
    detail: 'Deployed to KUB Testnet (25925) · developDelay=3600s',
    txHash: `0x${hex(1201, 64)}`,
    minutesAgo: 180,
  },
  {
    id: 'aud-2',
    actor: '0x243d78f9c2a0114e9b6c88a12f00431d9a4c9350',
    category: 'films',
    action: 'film.publish',
    target: 'Film #1 · KUB 400',
    detail: '24 frames · active=true',
    txHash: `0x${hex(1202, 64)}`,
    minutesAgo: 175,
  },
  {
    id: 'aud-3',
    actor: '0x243d78f9c2a0114e9b6c88a12f00431d9a4c9350',
    category: 'films',
    action: 'film.publish',
    target: 'Film #2 · Mono 400',
    detail: '24 frames · active=true',
    txHash: `0x${hex(1203, 64)}`,
    minutesAgo: 174,
  },
  {
    id: 'aud-4',
    actor: '0x243d78f9c2a0114e9b6c88a12f00431d9a4c9350',
    category: 'films',
    action: 'film.publish',
    target: 'Film #3 · Night 800',
    detail: '24 frames · active=true',
    txHash: `0x${hex(1204, 64)}`,
    minutesAgo: 173,
  },
  {
    id: 'aud-5',
    actor: '0x9a3bc0124ef98123400a19c2208f7109d443e21f',
    category: 'moderation',
    action: 'post.hide',
    target: 'post-831',
    detail: 'Spam link in caption',
    minutesAgo: 92,
  },
  {
    id: 'aud-6',
    actor: '0x9a3bc0124ef98123400a19c2208f7109d443e21f',
    category: 'users',
    action: 'user.ban',
    target: `0x${hex(711, 40)}`,
    detail: 'Repeated automated spam uploads',
    minutesAgo: 64,
  },
  {
    id: 'aud-7',
    actor: '0x243d78f9c2a0114e9b6c88a12f00431d9a4c9350',
    category: 'gas',
    action: 'quota.limit',
    target: `0x${hex(906, 40)}`,
    detail: 'Rate-limited to 10 tx/day (bot threshold 4.6 tx/min)',
    minutesAgo: 31,
  },
]
