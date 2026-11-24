export type CloudSyncedFrame = {
  frame: number
  photoHash: `0x${string}`
  txHash?: `0x${string}`
  createdAt: number
  url: string
}

/**
 * Uploads a single shot blob to the owner's private R2 bucket via our authenticated API.
 * Silently returns false if the user hasn't signed SIWE yet or is offline.
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
    return res.ok
  } catch {
    return false
  }
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
