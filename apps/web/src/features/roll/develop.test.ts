import { describe, expect, it } from 'vitest'
import { countdown, rollStage } from './develop'

describe('rollStage', () => {
  const base = { frames: 24, framesUsed: 0, developReadyAt: 0 }
  it('shooting → full → developing → developed', () => {
    expect(rollStage({ ...base, framesUsed: 7 }, 100)).toBe('shooting')
    expect(rollStage({ ...base, framesUsed: 24 }, 100)).toBe('full')
    expect(rollStage({ ...base, framesUsed: 24, developReadyAt: 200 }, 199)).toBe('developing')
    expect(rollStage({ ...base, framesUsed: 24, developReadyAt: 200 }, 200)).toBe('developed')
  })
})

describe('countdown', () => {
  it('formats minutes and hours, never negative', () => {
    expect(countdown(100 + 59 * 60 + 5, 100)).toBe('59:05')
    expect(countdown(3600 + 61, 0)).toBe('1:01:01')
    expect(countdown(10, 50)).toBe('0:00')
  })
})
