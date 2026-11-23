import { describe, expect, it } from 'vitest'
import { FRAME_ASPECT, captureSize, coverCrop } from './geometry'
import { MAX_PHOTO_BYTES, fitQuality } from './encode'
import { parseCubeLut } from './lut'
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

describe('parseCubeLut', () => {
  it('parses a 2x2x2 Adobe .cube file and extracts title, size and look parameters', () => {
    const cube = [
      '# Created by ChainRoll Lab',
      'TITLE "Warm Dusk 160"',
      'LUT_3D_SIZE 2',
      '0.04 0.03 0.02',
      '0.85 0.15 0.10',
      '0.10 0.85 0.12',
      '0.92 0.88 0.20',
      '0.10 0.12 0.82',
      '0.90 0.20 0.85',
      '0.15 0.88 0.88',
      '0.98 0.94 0.88',
    ].join('\n')
    const info = parseCubeLut(cube)
    expect(info.title).toBe('Warm Dusk 160')
    expect(info.size).toBe(2)
    expect(info.points).toBe(8)
    expect(info.look.monochrome).toBe(false)
    expect(info.look.fade).toBeGreaterThan(0)
  })

  it('detects monochrome .cube LUTs and rejects malformed files', () => {
    const mono = [
      'TITLE "Silver B&W"',
      'LUT_3D_SIZE 2',
      '0.02 0.02 0.02',
      '0.30 0.30 0.30',
      '0.45 0.45 0.45',
      '0.55 0.55 0.55',
      '0.60 0.60 0.60',
      '0.75 0.75 0.75',
      '0.85 0.85 0.85',
      '0.98 0.98 0.98',
    ].join('\n')
    expect(parseCubeLut(mono).look.monochrome).toBe(true)
    expect(() => parseCubeLut('TITLE "Empty"\n0 0 0')).toThrow()
  })
})
