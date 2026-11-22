import { describe, expect, it } from 'vitest'
import { FRAME_ASPECT, captureSize, coverCrop } from './geometry'
import { MAX_PHOTO_BYTES, fitQuality } from './encode'
import { FILM_STOCKS, getStock } from './stocks'

describe('coverCrop', () => {
  it('crops the sides of a landscape 4:3 camera into a 2:3 portrait frame', () => {
    const c = coverCrop(4000, 3000, FRAME_ASPECT)
    expect(c.scaleY).toBe(1)
    expect(c.scaleX).toBeCloseTo(FRAME_ASPECT / (4 / 3))
    expect(c.offsetX).toBeCloseTo((1 - c.scaleX) / 2)
  })

  it('crops top/bottom of a tall 9:16 phone stream', () => {
    const c = coverCrop(1080, 1920, FRAME_ASPECT)
    expect(c.scaleX).toBe(1)
    expect(c.scaleY).toBeCloseTo(1080 / 1920 / FRAME_ASPECT)
    expect(c.offsetY).toBeCloseTo((1 - c.scaleY) / 2)
  })

  it('is identity when aspects match, and safe on empty sources', () => {
    expect(coverCrop(200, 300, FRAME_ASPECT)).toEqual({
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0,
    })
    expect(coverCrop(0, 0, FRAME_ASPECT)).toEqual({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 })
  })
})

describe('captureSize', () => {
  it('keeps a 2:3 output capped at 2048px', () => {
    const s = captureSize(4032, 3024)
    expect(s.height).toBe(2048)
    expect(s.width / s.height).toBeCloseTo(FRAME_ASPECT, 2)
  })

  it('never upscales a small source', () => {
    const s = captureSize(640, 480)
    expect(s.height).toBe(480)
    expect(s.width).toBe(320)
  })
})

describe('fitQuality', () => {
  it('returns the first quality that fits', async () => {
    const sizes: Record<number, number> = { 0.86: 500_000, 0.8: 320_000, 0.72: 280_000 }
    const q = await fitQuality(async (q) => sizes[q] ?? 100_000)
    expect(q).toBe(0.72)
  })

  it('falls back to the lowest step when nothing fits', async () => {
    const q = await fitQuality(async () => MAX_PHOTO_BYTES * 3)
    expect(q).toBe(0.4)
  })
})

describe('film stocks', () => {
  it('ids match the on-chain films seeded by Deploy.s.sol (1,2,3) with 24 frames', () => {
    expect(FILM_STOCKS.map((s) => [s.id, s.frames])).toEqual([
      [1, 24],
      [2, 24],
      [3, 24],
    ])
  })

  it('getStock falls back to the first stock', () => {
    expect(getStock(999).id).toBe(1)
  })
})
