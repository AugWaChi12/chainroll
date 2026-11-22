/**
 * Film stocks — the "look" of each roll.
 * `id` must match the on-chain filmId (packages/contracts/script/Deploy.s.sol).
 * Names are ours, never real film brands (PROJECT_BRIEF §9).
 */

export type RGB = readonly [number, number, number]

export type FilmLook = {
  /** stops, applied before the curve */
  exposure: number
  /** 0 = flat, 1 = strong S-curve */
  contrast: number
  saturation: number
  /** lifts the black point (faded film base) */
  fade: number
  /** colour pushed into shadows / highlights (split toning), 0..1 per channel offset around 0 */
  shadowTint: RGB
  highlightTint: RGB
  /** overall white balance multiplier */
  balance: RGB
  /** 0..1 grain amount, size in output pixels */
  grain: number
  grainSize: number
  /** red glow around highlights */
  halation: number
  halationTint: RGB
  vignette: number
  monochrome: boolean
}

export type FilmStock = {
  id: number
  name: string
  /** text on the film rebate */
  code: string
  iso: number
  frames: number
  /** swatch for the picker */
  swatch: string
  look: FilmLook
}

export const FILM_STOCKS: readonly FilmStock[] = [
  {
    id: 1,
    name: 'KUB 400',
    code: 'KUB 400',
    iso: 400,
    frames: 24,
    swatch: 'linear-gradient(135deg,#e9b47a,#b8643a 55%,#3a1f17)',
    look: {
      exposure: 0.05,
      contrast: 0.35,
      saturation: 1.08,
      fade: 0.05,
      shadowTint: [-0.01, 0.015, 0.02],
      highlightTint: [0.05, 0.025, -0.03],
      balance: [1.04, 1.0, 0.94],
      grain: 0.32,
      grainSize: 1.6,
      halation: 0.18,
      halationTint: [1.0, 0.35, 0.15],
      vignette: 0.32,
      monochrome: false,
    },
  },
  {
    id: 2,
    name: 'ขาวดำ 400',
    code: 'BW 400',
    iso: 400,
    frames: 24,
    swatch: 'linear-gradient(135deg,#f2ede4,#8a8178 55%,#1a1714)',
    look: {
      exposure: 0.0,
      contrast: 0.65,
      saturation: 0,
      fade: 0.03,
      shadowTint: [0, 0, 0],
      highlightTint: [0.012, 0.008, 0],
      balance: [1, 1, 1],
      grain: 0.5,
      grainSize: 1.8,
      halation: 0,
      halationTint: [1, 1, 1],
      vignette: 0.42,
      monochrome: true,
    },
  },
  {
    id: 3,
    name: 'Night 800',
    code: 'NT 800',
    iso: 800,
    frames: 24,
    swatch: 'linear-gradient(135deg,#2a3a4a,#5c4a3d 50%,#d9a066)',
    look: {
      exposure: 0.15,
      contrast: 0.42,
      saturation: 0.95,
      fade: 0.07,
      shadowTint: [-0.02, 0.01, 0.045],
      highlightTint: [0.03, 0.0, -0.02],
      balance: [0.93, 0.98, 1.08],
      grain: 0.55,
      grainSize: 2.0,
      halation: 0.55,
      halationTint: [1.0, 0.22, 0.12],
      vignette: 0.36,
      monochrome: false,
    },
  },
] as const

export function getStock(id: number): FilmStock {
  return FILM_STOCKS.find((s) => s.id === id) ?? FILM_STOCKS[0]!
}
