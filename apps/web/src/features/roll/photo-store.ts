'use client'

/**
 * Local-first photo store (IndexedDB). Photos never leave the device until the user posts
 * (R2 upload lands in M3b). Survives reloads and offline use — like undeveloped film.
 */

export type PhotoStatus = 'pending' | 'confirmed' | 'failed'

export type PhotoRecord = {
  hash: `0x${string}`
  /** `${chainId}:${rollId}` */
  rollKey: string
  frame: number
  filmId: number
  blob: Blob
  mime: string
  bytes: number
  width: number
  height: number
  quality: number
  takenAt: number
  status: PhotoStatus
  txHash?: `0x${string}`
  errorCode?: string
  errorReason?: string
}

const DB = 'chainroll'
const STORE = 'photos'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore(STORE, { keyPath: 'hash' })
      s.createIndex('rollKey', 'rollKey')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).finally(() => db.close())
}

let persistRequested = false

function ensurePersistentStorage() {
  if (persistRequested || typeof navigator === 'undefined') return
  persistRequested = true
  try {
    void navigator.storage?.persist?.()?.catch(() => {})
  } catch {
    // ignore if unsupported
  }
}

export const photoStore = {
  async put(p: PhotoRecord) {
    ensurePersistentStorage()
    try {
      await tx('readwrite', (s) => s.put(p))
    } catch {
      /* private mode / storage blocked — keep working in memory */
    }
  },
  async patch(hash: string, patch: Partial<PhotoRecord>) {
    try {
      const cur = await tx<PhotoRecord | undefined>('readonly', (s) => s.get(hash))
      if (cur) await tx('readwrite', (s) => s.put({ ...cur, ...patch }))
    } catch {
      /* ignore */
    }
  },
  async listRoll(rollKey: string): Promise<PhotoRecord[]> {
    try {
      const rows = await tx<PhotoRecord[]>('readonly', (s) => s.index('rollKey').getAll(rollKey))
      return rows.sort((a, b) => a.frame - b.frame)
    } catch {
      return []
    }
  },
  /** Every photo stored on this device across all rolls, newest first. */
  async listAll(): Promise<PhotoRecord[]> {
    try {
      const rows = await tx<PhotoRecord[]>('readonly', (s) => s.getAll())
      return rows.sort((a, b) => b.takenAt - a.takenAt)
    } catch {
      return []
    }
  },
  /** Every roll key that has at least one photo on this device. */
  async rollKeys(): Promise<string[]> {
    try {
      const rows = await tx<PhotoRecord[]>('readonly', (s) => s.getAll())
      return [...new Set(rows.map((r) => r.rollKey))]
    } catch {
      return []
    }
  },
  async clearRoll(rollKey: string) {
    const rows = await this.listRoll(rollKey)
    for (const r of rows) {
      try {
        await tx('readwrite', (s) => s.delete(r.hash))
      } catch {
        /* ignore */
      }
    }
  },
}
