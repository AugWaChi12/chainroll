import type { FilmLook, RGB } from './stocks'

export type CubeLutInfo = {
  title: string
  size: number
  points: number
  look: Partial<FilmLook>
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/**
 * Parses an Adobe `.cube` 3D LUT file and derives shader parameters (`FilmLook` subset)
 * from its black point, white point, mid-grey response, and colour separation.
 */
export function parseCubeLut(text: string): CubeLutInfo {
  let title = 'Custom LUT'
  let size = 0
  const rows: RGB[] = []

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.toUpperCase().startsWith('TITLE')) {
      const m = line.match(/TITLE\s+"?([^"]+)"?/i)
      if (m?.[1]) title = m[1].trim()
      continue
    }
    if (line.toUpperCase().startsWith('LUT_3D_SIZE')) {
      const parts = line.split(/\s+/)
      size = Number(parts[1] ?? 0)
      continue
    }
    if (/^[A-Za-z_]/.test(line)) continue
    const nums = line.split(/\s+/).map(Number)
    if (nums.length >= 3 && nums.every((n) => Number.isFinite(n))) {
      rows.push([nums[0]!, nums[1]!, nums[2]!])
    }
  }

  if (rows.length < 8) {
    throw new Error('Invalid .cube LUT: requires at least 8 RGB lattice points')
  }
  if (!size) {
    size = Math.round(Math.cbrt(rows.length))
  }

  const black = rows[0]!
  const white = rows[rows.length - 1]!
  const mid = rows[Math.floor(rows.length / 2)]!

  const fade = clamp((black[0] + black[1] + black[2]) / 3, 0, 0.25)
  const midLuma = 0.2126 * mid[0] + 0.7152 * mid[1] + 0.0722 * mid[2]
  const exposure = clamp((midLuma - 0.5) * 1.2, -0.5, 0.5)

  const whiteLuma = (white[0] + white[1] + white[2]) / 3
  const blackLuma = (black[0] + black[1] + black[2]) / 3
  const span = clamp(whiteLuma - blackLuma, 0.4, 1.2)
  const contrast = clamp((span - 0.65) * 1.4, 0, 1)

  // Check colour separation across lattice points to estimate saturation & monochrome
  let chromaSum = 0
  for (const [r, g, b] of rows) {
    const avg = (r + g + b) / 3
    chromaSum += Math.abs(r - avg) + Math.abs(g - avg) + Math.abs(b - avg)
  }
  const avgChroma = chromaSum / rows.length
  const monochrome = avgChroma < 0.015
  const saturation = monochrome ? 0 : clamp(avgChroma * 3.2, 0.4, 1.5)

  const balance: RGB = [
    clamp(white[0] / Math.max(0.2, whiteLuma), 0.85, 1.15),
    clamp(white[1] / Math.max(0.2, whiteLuma), 0.85, 1.15),
    clamp(white[2] / Math.max(0.2, whiteLuma), 0.85, 1.15),
  ]

  const shadowTint: RGB = [
    clamp(black[0] - blackLuma, -0.08, 0.08),
    clamp(black[1] - blackLuma, -0.08, 0.08),
    clamp(black[2] - blackLuma, -0.08, 0.08),
  ]

  const highlightTint: RGB = [
    clamp(white[0] - whiteLuma, -0.08, 0.08),
    clamp(white[1] - whiteLuma, -0.08, 0.08),
    clamp(white[2] - whiteLuma, -0.08, 0.08),
  ]

  return {
    title,
    size,
    points: rows.length,
    look: {
      exposure: Number(exposure.toFixed(2)),
      contrast: Number(contrast.toFixed(2)),
      saturation: Number(saturation.toFixed(2)),
      fade: Number(fade.toFixed(2)),
      balance,
      shadowTint,
      highlightTint,
      monochrome,
    },
  }
}
