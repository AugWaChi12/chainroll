/**
 * MOCK DATA — for M1 UI only. Replaced by indexer/DB queries in M3.
 * Values are deterministic so server and client render the same thing.
 */

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

const FILMS = ['KUB 400', 'ขาวดำ 400', 'Night 800', 'อุ่น 160']
const HANDLES = ['ploy.shoots', null, 'bank_35mm', 'nong.film', null, 'tee.k', 'mint_roll', null]

function hex(seed: number, len: number) {
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
