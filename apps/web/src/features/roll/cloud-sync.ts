import { photoStore } from './photo-store'

export type CloudSyncedFrame = {
  frame: number
  photoHash: `0x${string}`
  txHash?: `0x${string}`
  createdAt: number
  url: string
}

const SYNCED_HASHES_KEY = 'chainroll.cloudSyncedHashes.v1'

function loadSyncedHashes(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(SYNCED_HASHES_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((s): s is string => typeof s === 'string'))
  } catch {
    return new Set()
  }
}

function markHashSynced(photoHash: string) {
  if (typeof window === 'undefined') return
  try {
    const set = loadSyncedHashes()
    set.add(photoHash.toLowerCase())
    // Cap stored hashes at 500 most recent to keep localStorage tiny
    const list = [...set].slice(-500)
    window.localStorage.setItem(SYNCED_HASHES_KEY, JSON.stringify(list))
  } catch {
    // ignore storage quota errors
  }
}

export function isHashLocallyMarkedSynced(photoHash: string): boolean {
  return loadSyncedHashes().has(photoHash.toLowerCase())
}

/**
 * Uploads a single shot blob to the owner's private R2 bucket (zero-SIWE: verified server-side
 * via keccak256(bytes) === photoHash + authoritative roll lookup).
 */
export async function uploadFrameToPrivateCloud(input: {
  rollId: bigint | number
  frame: number
  photoHash: string
  filmId: number
  frames: number
  blob: Blob
  txHash?: string
}): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const form = new FormData()
    form.set('frame', String(input.frame))
    form.set('photoHash', input.photoHash)
    form.set('filmId', String(input.filmId))
    form.set('frames', String(input.frames))
    if (input.txHash) form.set('txHash', input.txHash)
    const ext = input.blob.type === 'image/jpeg' ? 'jpg' : 'webp'
    form.set('file', input.blob, `frame-${input.frame}.${ext}`)

    const res = await window.fetch(`/api/rolls/${String(input.rollId)}/frames`, {
      method: 'POST',
      body: form,
    })
    if (res.ok) {
      markHashSynced(input.photoHash)
      return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Automatically sweeps ALL local IndexedDB rolls on this device for `chainId` and uploads
 * any unsynced frames to Private R2 in parallel batches of 3 (zero SIWE required).
 */
export async function syncAllLocalRollsToCloud(
  chainId: number,
  onProgress?: (done: number, total: number) => void,
): Promise<{ uploaded: number; total: number }> {
  if (typeof window === 'undefined') return { uploaded: 0, total: 0 }

  const prefix = `${chainId}:`
  const keys = (await photoStore.rollKeys()).filter((k) => k.startsWith(prefix))
  const alreadySynced = loadSyncedHashes()

  type QueueItem = {
    rollId: number
    frame: number
    photoHash: string
    filmId: number
    blob: Blob
    txHash?: string
  }

  const queue: QueueItem[] = []
  for (const key of keys) {
    const rollId = Number(key.slice(prefix.length))
    if (!Number.isSafeInteger(rollId) || rollId <= 0) continue
    const rows = await photoStore.listRoll(key)
    for (const row of rows) {
      if (!row.blob || row.blob.size === 0) continue
      if (alreadySynced.has(row.hash.toLowerCase())) continue
      queue.push({
        rollId,
        frame: row.frame,
        photoHash: row.hash,
        filmId: row.filmId,
        blob: row.blob,
        txHash: row.txHash,
      })
    }
  }

  const total = queue.length
  if (total === 0) return { uploaded: 0, total: 0 }

  let done = 0
  let uploaded = 0
  onProgress?.(0, total)

  for (let i = 0; i < queue.length; i += 3) {
    const batch = queue.slice(i, i + 3)
    await Promise.all(
      batch.map(async (item) => {
        const ok = await uploadFrameToPrivateCloud({
          rollId: item.rollId,
          frame: item.frame,
          photoHash: item.photoHash,
          filmId: item.filmId,
          frames: 24,
          blob: item.blob,
          txHash: item.txHash,
        })
        done += 1
        if (ok) uploaded += 1
        onProgress?.(done, total)
      }),
    )
  }

  return { uploaded, total }
}

export async function fetchCloudFramesForRoll(
  rollId: bigint | number,
): Promise<{ authRequired: boolean; frames: CloudSyncedFrame[] }> {
  if (typeof window === 'undefined') return { authRequired: false, frames: [] }
  try {
    const res = await window.fetch(`/api/rolls/${String(rollId)}/frames`, {
      cache: 'no-store',
    })
    if (res.status === 401) {
      return { authRequired: true, frames: [] }
    }
    if (!res.ok) {
      return { authRequired: false, frames: [] }
    }
    const data = (await res.json()) as { ok?: boolean; frames?: CloudSyncedFrame[] }
    return {
      authRequired: false,
      frames: Array.isArray(data.frames) ? data.frames : [],
    }
  } catch {
    return { authRequired: false, frames: [] }
  }
}
