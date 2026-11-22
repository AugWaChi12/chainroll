/** 35mm frame, portrait (2:3). */
export const FRAME_ASPECT = 2 / 3

/** Longest edge of the captured photo, in px. */
export const CAPTURE_LONG_EDGE = 2048

export type Crop = { scaleX: number; scaleY: number; offsetX: number; offsetY: number }

/**
 * UV transform that "object-fit: cover"s a source of srcW×srcH into a target of aspect `dstAspect` (w/h).
 * Shader samples `uv * scale + offset`.
 */
export function coverCrop(srcW: number, srcH: number, dstAspect: number): Crop {
  if (srcW <= 0 || srcH <= 0) return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }
  const srcAspect = srcW / srcH
  if (srcAspect > dstAspect) {
    // source is wider → crop left/right
    const scaleX = dstAspect / srcAspect
    return { scaleX, scaleY: 1, offsetX: (1 - scaleX) / 2, offsetY: 0 }
  }
  const scaleY = srcAspect / dstAspect
  return { scaleX: 1, scaleY, offsetX: 0, offsetY: (1 - scaleY) / 2 }
}

/** Output size for a capture: keep FRAME_ASPECT, never upscale beyond the source's cropped area. */
export function captureSize(srcW: number, srcH: number, longEdge = CAPTURE_LONG_EDGE) {
  const crop = coverCrop(srcW, srcH, FRAME_ASPECT)
  const availH = Math.round(srcH * crop.scaleY)
  const h = Math.max(1, Math.min(longEdge, availH))
  const w = Math.max(1, Math.round(h * FRAME_ASPECT))
  return { width: w, height: h }
}
