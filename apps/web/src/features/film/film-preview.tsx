'use client'

import { useEffect, useRef, useState } from 'react'
import { FRAME_ASPECT } from './geometry'
import { FilmRenderer } from './renderer'
import type { FilmLook } from './stocks'

export const SAMPLE_SCENES = ['nature', 'portrait', 'night', 'indoor'] as const
export type SampleSceneKind = (typeof SAMPLE_SCENES)[number]

const sceneCache = new Map<SampleSceneKind, HTMLCanvasElement>()
const photoCache = new Map<SampleSceneKind, HTMLImageElement>()
const photoPromises = new Map<SampleSceneKind, Promise<HTMLImageElement | null>>()

function loadSamplePhoto(kind: SampleSceneKind): Promise<HTMLImageElement | null> {
  const cached = photoCache.get(kind)
  if (cached) return Promise.resolve(cached)
  const inflight = photoPromises.get(kind)
  if (inflight) return inflight

  const p = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      photoCache.set(kind, img)
      resolve(img)
    }
    img.onerror = () => resolve(null)
    img.src = `/samples/${kind}.jpg`
  })
  photoPromises.set(kind, p)
  return p
}

/**
 * Fallback procedural canvas if the photographic asset hasn't loaded yet.
 */
export function sampleScene(kind: SampleSceneKind = 'nature'): HTMLCanvasElement {
  const cached = sceneCache.get(kind)
  if (cached) return cached

  const w = 600
  const h = Math.round(w / FRAME_ASPECT)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const bg = g.createLinearGradient(0, 0, 0, h)
  if (kind === 'night') {
    bg.addColorStop(0, '#090d16')
    bg.addColorStop(1, '#18141a')
  } else if (kind === 'indoor') {
    bg.addColorStop(0, '#231b16')
    bg.addColorStop(1, '#3d2a1d')
  } else if (kind === 'portrait') {
    bg.addColorStop(0, '#6e4736')
    bg.addColorStop(1, '#3d2821')
  } else {
    bg.addColorStop(0, '#2b4d7e')
    bg.addColorStop(1, '#c9876a')
  }
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  sceneCache.set(kind, c)
  return c
}

/**
 * Renders `look` over the real 35mm sample photograph with a fixed grain seed via WebGL2.
 * When `split` (0..1) is provided, shows a before (left) / after (right) comparison.
 */
export function FilmPreview({
  look,
  scene = 'nature',
  split,
  splitSide = 'raw-left',
  className,
}: {
  look: FilmLook
  scene?: SampleSceneKind
  /** 0..1 position of the before/after divider; undefined = full film look */
  split?: number
  /** Which side shows the raw ungraded photo: 'raw-left' (default) or 'film-left' */
  splitSide?: 'raw-left' | 'film-left'
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const rawRef = useRef<HTMLCanvasElement>(null)
  const [failed, setFailed] = useState(false)
  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(() => photoCache.get(scene) ?? null)

  useEffect(() => {
    let alive = true
    const cached = photoCache.get(scene) ?? null
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync cache hit
    setLoadedImg(cached)
    if (!cached) {
      void loadSamplePhoto(scene).then((img) => {
        if (alive && img) setLoadedImg(img)
      })
    }
    return () => {
      alive = false
    }
  }, [scene])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let r: FilmRenderer | null = null
    try {
      r = new FilmRenderer(canvas, { preserveDrawingBuffer: true })
      const src = loadedImg ?? sampleScene(scene)
      const natW = src instanceof HTMLImageElement ? src.naturalWidth : src.width
      const natH = src instanceof HTMLImageElement ? src.naturalHeight : src.height
      const targetW = Math.min(720, natW || 600)
      const targetH = Math.round(targetW * ((natH || 900) / (natW || 600)))
      r.setSize(targetW, targetH)
      r.render(src, look, { seed: 0.42 })
    } catch {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- WebGL capability result
      setFailed(true)
    }
    return () => r?.dispose()
  }, [loadedImg, look, scene])

  useEffect(() => {
    if (split === undefined) return
    const rawCanvas = rawRef.current
    if (!rawCanvas) return
    const src = loadedImg ?? sampleScene(scene)
    const natW = src instanceof HTMLImageElement ? src.naturalWidth : src.width
    const natH = src instanceof HTMLImageElement ? src.naturalHeight : src.height
    const targetW = Math.min(720, natW || 600)
    const targetH = Math.round(targetW * ((natH || 900) / (natW || 600)))
    rawCanvas.width = targetW
    rawCanvas.height = targetH
    const ctx = rawCanvas.getContext('2d')
    ctx?.drawImage(src, 0, 0, targetW, targetH)
  }, [loadedImg, scene, split])

  if (failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static fallback sample
      <img src={`/samples/${scene}.jpg`} alt="" className={className} />
    )
  }

  const pct = split !== undefined ? Math.round(Math.min(1, Math.max(0, split)) * 100) : 0
  const rawClip =
    splitSide === 'film-left' ? `inset(0 0 0 ${pct}%)` : `inset(0 ${100 - pct}% 0 0)`

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`}>
      <canvas ref={ref} className="block size-full object-cover" role="img" aria-hidden />
      {split !== undefined && (
        <>
          <canvas
            ref={rawRef}
            aria-hidden
            className="pointer-events-none absolute inset-0 size-full object-cover"
            style={{ clipPath: rawClip }}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 w-px bg-frame shadow-[0_0_6px_rgba(232,163,61,0.8)]"
            style={{ left: `${pct}%` }}
          />
        </>
      )}
    </div>
  )
}
