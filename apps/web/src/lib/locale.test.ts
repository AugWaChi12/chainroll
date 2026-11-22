import { describe, expect, it } from 'vitest'
import { localeFromAcceptLanguage } from './locale'

describe('localeFromAcceptLanguage', () => {
  it('prefers Thai whenever the browser mentions it', () => {
    expect(localeFromAcceptLanguage('en-US,en;q=0.9,th;q=0.8')).toBe('th')
    expect(localeFromAcceptLanguage('th-TH')).toBe('th')
  })
  it('uses English for English-first browsers without Thai', () => {
    expect(localeFromAcceptLanguage('en-GB,en;q=0.9')).toBe('en')
  })
  it('falls back to Thai', () => {
    expect(localeFromAcceptLanguage(null)).toBe('th')
    expect(localeFromAcceptLanguage('ja-JP,ja;q=0.9')).toBe('th')
  })
})
