import { keccak256 } from 'viem'

/** PROJECT_BRIEF §10.3 — photos are ≤ 300KB. */
export const MAX_PHOTO_BYTES = 300 * 1024

export type EncodedPhoto = {
  blob: Blob
  /** keccak256 of the exact bytes — this is what goes on-chain */
  hash: `0x${string}`
  mime: string
  bytes: number
  quality: number
  width: number
  height: number
}

/**
 * Quality steps tried in order until the file fits. Pure so it can be unit-tested.
 * Returns the first quality whose size ≤ max, or the last one tried.
 */
export async function fitQuality(
  encode: (quality: number) => Promise<number>,
  max = MAX_PHOTO_BYTES,
  steps = [0.86, 0.8, 0.72, 0.64, 0.56, 0.48, 0.4],
): Promise<number> {
  let q = steps[0]!
  for (q of steps) {
    if ((await encode(q)) <= max) return q
  }
  return q
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), type, quality),
  )
}

/** WebP where supported; Safari can't encode WebP from canvas, so it falls back to JPEG. */
export async function supportedImageType(): Promise<'image/webp' | 'image/jpeg'> {
  const c = document.createElement('canvas')
  c.width = c.height = 1
  const b = await toBlob(c, 'image/webp', 0.8).catch(() => null)
  return b?.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
}

export async function encodeCanvas(canvas: HTMLCanvasElement): Promise<EncodedPhoto> {
  const mime = await supportedImageType()
  const cache = new Map<number, Blob>()
  const quality = await fitQuality(async (q) => {
    const b = await toBlob(canvas, mime, q)
    cache.set(q, b)
    return b.size
  })
  const blob = cache.get(quality)!
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return {
    blob,
    hash: keccak256(bytes),
    mime: blob.type,
    bytes: blob.size,
    quality,
    width: canvas.width,
    height: canvas.height,
  }
}
