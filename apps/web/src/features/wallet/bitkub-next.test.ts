import { chainRollAbi } from '@deekub/contracts'
import { describe, expect, it } from 'vitest'
import { NEXT_SIGNATURES } from './bitkub-next'

/** The SDK encodes calls from these strings — a typo would silently call a non-existent function. */
describe('Bitkub NEXT signatures match the ChainRoll router entry points', () => {
  for (const [name, sig] of Object.entries(NEXT_SIGNATURES)) {
    it(name, () => {
      const types = sig
        .slice(sig.indexOf('(') + 1, -1)
        .split(',')
        .map((p) => p.trim().split(' ')[0])
      const fn = chainRollAbi.find(
        (e) =>
          e.type === 'function' &&
          e.name === name &&
          e.inputs.length === types.length &&
          e.inputs.at(-1)?.name === '_bitkubNext',
      )
      expect(fn, `no router overload for ${name}`).toBeDefined()
      expect(fn && 'inputs' in fn ? fn.inputs.map((i) => i.type) : []).toEqual(types)
    })
  }
})
