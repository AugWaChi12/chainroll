import { describe, expect, it } from 'vitest'
import en from '../../messages/en.json'
import th from '../../messages/th.json'

/** Every message key must exist in every language, with the same {placeholders}. */
function flatten(obj: unknown, prefix = ''): Record<string, string> {
  if (typeof obj === 'string') return { [prefix]: obj }
  if (Array.isArray(obj))
    return Object.assign({}, ...obj.map((v, i) => flatten(v, `${prefix}[${i}]`)))
  if (obj && typeof obj === 'object')
    return Object.assign(
      {},
      ...Object.entries(obj).map(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k)),
    )
  return {}
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('messages', () => {
  const t = flatten(th)
  const e = flatten(en)

  it('th and en have the same keys', () => {
    expect(Object.keys(e).sort()).toEqual(Object.keys(t).sort())
  })

  it('placeholders match in every string', () => {
    for (const key of Object.keys(t)) {
      expect(placeholders(e[key] ?? ''), key).toEqual(placeholders(t[key]!))
    }
  })
})
