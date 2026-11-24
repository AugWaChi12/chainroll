import { describe, expect, it } from 'vitest'
import { defaultSceneTags, expandVisualQuery, parseGeminiVisualResponse } from './visual-tagger'

describe('visual-tagger', () => {
  it('expands Thai river queries to bilingual river/water terms without AI tokens', () => {
    const terms = expandVisualQuery('แม่น้ำ')
    expect(terms).toContain('แม่น้ำ')
    expect(terms).toContain('river')
    expect(terms).toContain('น้ำ')
    expect(terms.length).toBeLessThanOrEqual(16)
  })

  it('expands English night queries to Thai equivalents', () => {
    const terms = expandVisualQuery('night')
    expect(terms).toContain('night')
    expect(terms).toContain('กลางคืน')
    expect(terms).toContain('neon')
  })

  it('parses structured Gemini JSON response cleanly and deduplicates tags', () => {
    const res = parseGeminiVisualResponse(
      '```json\n{"tags":["#แม่น้ำ","River","river"," พระอาทิตย์ตก "],"desc":"แม่น้ำยามเย็น / Sunset river view"}\n```',
    )
    expect(res).not.toBeNull()
    expect(res?.tags).toEqual(['แม่น้ำ', 'river', 'พระอาทิตย์ตก'])
    expect(res?.description).toBe('แม่น้ำยามเย็น / Sunset river view')
  })

  it('provides baseline visual tags for sample scenes', () => {
    expect(defaultSceneTags('nature')).toContain('แม่น้ำ')
    expect(defaultSceneTags('indoor')).toContain('คาเฟ่')
  })
})
