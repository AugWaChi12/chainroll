'use client'

import { useEffect, useRef, useState } from 'react'
import { FRAME_ASPECT } from './geometry'
import { FilmRenderer } from './renderer'
import type { FilmLook } from './stocks'

let sceneCache: HTMLCanvasElement | null = null

/**
 * A procedural "photo" (dusk sky, sun, hills, colour chips, skin tone) so every film is judged on
 * the same frame — no stock photos, nothing borrowed.
 */
export function sampleScene(): HTMLCanvasElement {
  if (sceneCache) return sceneCache
  const w = 800
  const h = Math.round(w / FRAME_ASPECT)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const sky = g.createLinearGradient(0, 0, 0, h * 0.62)
  sky.addColorStop(0, '#2b4d7e')
  sky.addColorStop(0.55, '#c9876a')
  sky.addColorStop(1, '#f3c27a')
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  // sun
  g.fillStyle = '#fff7df'
  g.beginPath()
  g.arc(w * 0.66, h * 0.47, w * 0.075, 0, Math.PI * 2)
  g.fill()
  // hills
  const hill = (y: number, color: string, amp: number, f: number) => {
    g.fillStyle = color
    g.beginPath()
    g.moveTo(0, h)
    for (let x = 0; x <= w; x += 8)
      g.lineTo(x, y + Math.sin(x * f) * amp + Math.sin(x * f * 2.7) * amp * 0.4)
    g.lineTo(w, h)
    g.fill()
  }
  hill(h * 0.6, '#4d4a6b', 18, 0.011)
  hill(h * 0.68, '#2f3b2e', 24, 0.008)
  hill(h * 0.78, '#1d2219', 14, 0.014)
  // colour chips + skin tone (how each film treats colour)
  const chips = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#2980b9', '#e0ac82']
  chips.forEach((col, i) => {
    g.fillStyle = col
    g.fillRect(w * 0.08 + i * w * 0.14, h * 0.86, w * 0.12, h * 0.07)
  })
  sceneCache = c
  return c
}

/** Renders `look` over the sample scene once, with a fixed grain seed. */
export function FilmPreview({ look, className }: { look: FilmLook; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let r: FilmRenderer | null = null
    try {
      r = new FilmRenderer(canvas, { preserveDrawingBuffer: true })
      const scene = sampleScene()
      r.setSize(scene.width, scene.height)
      r.render(scene, look, { seed: 0.42 })
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- WebGL capability result
      setFailed(true)
    }
    return () => r?.dispose()
  }, [look])

  if (failed) return <div className={className} style={{ background: '#1a1714' }} />
  return <canvas ref={ref} className={className} role="img" aria-hidden />
}
