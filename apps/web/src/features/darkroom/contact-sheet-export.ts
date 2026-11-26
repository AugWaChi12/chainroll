'use client'

import { truncateHash } from '@chainroll/ui'

export type ContactSheetFrameInput = {
  frame: number
  url?: string
  exposed: boolean
}

export type ContactSheetExportInput = {
  rollId: bigint
  stockCode: string
  stockName: string
  owner: string
  ownerHandle?: string | null
  totalFrames: number
  framesUsed: number
  frames: ContactSheetFrameInput[]
}

const PER_STRIP = 6

function frameMark(frame: number): string {
  return `${String(frame).padStart(2, '0')}${frame % 2 ? 'A' : ''}`
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const ir = img.naturalWidth / Math.max(1, img.naturalHeight)
  const dr = dw / dh
  let sx = 0
  let sy = 0
  let sw = img.naturalWidth
  let sh = img.naturalHeight

  if (ir > dr) {
    sw = img.naturalHeight * dr
    sx = (img.naturalWidth - sw) / 2
  } else {
    sh = img.naturalWidth / dr
    sy = (img.naturalHeight - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
}

/**
 * Renders a high-resolution 35mm darkroom Contact Sheet PNG (1600px wide)
 * with sprocket holes, amber film rebate markings, and on-chain attribution,
 * then triggers a browser download.
 */
export async function exportContactSheetPng(input: ContactSheetExportInput): Promise<void> {
  const strips = Math.max(1, Math.ceil(input.totalFrames / PER_STRIP))
  const width = 1600
  const padX = 56
  const headerH = 116
  const footerH = 74
  const stripGap = 28

  const innerW = width - padX * 2
  const frameGap = 14
  const frameW = Math.floor((innerW - frameGap * (PER_STRIP - 1)) / PER_STRIP)
  const frameH = Math.round(frameW * 1.5) // classic 2:3 35mm portrait frame
  const sprocketBandH = 38
  const rebateH = 26
  const stripH = sprocketBandH + rebateH + frameH + rebateH + sprocketBandH

  const height = headerH + strips * stripH + (strips - 1) * stripGap + footerH + 24

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  // Matte darkroom negative sheet background
  ctx.fillStyle = '#0B0908'
  ctx.fillRect(0, 0, width, height)

  // Top crimson darkroom bar
  ctx.fillStyle = '#D23A1E'
  ctx.fillRect(0, 0, width, 6)

  // Header metadata
  ctx.fillStyle = '#D23A1E'
  ctx.beginPath()
  ctx.arc(padX + 10, 52, 9, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#F2EDE4'
  ctx.font = '700 28px ui-sans-serif, system-ui, -apple-system, sans-serif'
  ctx.fillText('ChainRoll', padX + 30, 61)

  ctx.fillStyle = '#E8A33D'
  ctx.font = '600 15px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText(
    `35MM CONTACT SHEET  ·  ROLL #${String(input.rollId)}  ·  ${input.stockCode} (${input.stockName})`,
    padX + 180,
    59,
  )

  const shooterLabel = input.ownerHandle
    ? `@${input.ownerHandle} (${truncateHash(input.owner)})`
    : truncateHash(input.owner)
  const dateStr = new Date().toISOString().slice(0, 10)
  ctx.fillStyle = '#9D9388'
  ctx.font = '500 14px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText(
    `${shooterLabel}  ·  ${String(input.framesUsed).padStart(2, '0')}/${input.totalFrames} EXP  ·  ${dateStr}`,
    padX,
    92,
  )

  // Subtle divider line
  ctx.fillStyle = '#26221E'
  ctx.fillRect(padX, headerH - 12, innerW, 1)

  // Preload all available frame images in parallel
  const loadedImages = await Promise.all(
    input.frames.map((f) => (f.url ? loadImage(f.url) : Promise.resolve(null))),
  )

  // Draw each 6-frame 35mm strip
  for (let s = 0; s < strips; s++) {
    const stripY = headerH + s * (stripH + stripGap)

    // Strip celluloid backing
    ctx.fillStyle = '#13100E'
    ctx.fillRect(padX - 12, stripY, innerW + 24, stripH)
    ctx.strokeStyle = '#24201C'
    ctx.lineWidth = 1
    ctx.strokeRect(padX - 12, stripY, innerW + 24, stripH)

    // Top & bottom sprocket holes (24 per strip)
    const holeCount = 24
    const holeW = 28
    const holeH = 18
    const holeStep = innerW / holeCount
    for (let h = 0; h < holeCount; h++) {
      const hx = padX + h * holeStep + (holeStep - holeW) / 2
      ctx.fillStyle = '#060505'
      ctx.strokeStyle = '#2C2722'
      ctx.lineWidth = 1

      drawRoundedRect(ctx, hx, stripY + 10, holeW, holeH, 4)
      ctx.fill()
      ctx.stroke()

      drawRoundedRect(ctx, hx, stripY + stripH - 28, holeW, holeH, 4)
      ctx.fill()
      ctx.stroke()
    }

    // Frames in this strip
    const frameY = stripY + sprocketBandH + rebateH
    for (let k = 0; k < PER_STRIP; k++) {
      const idx = s * PER_STRIP + k
      const frameNum = idx + 1
      if (frameNum > input.totalFrames) break

      const fx = padX + k * (frameW + frameGap)
      const frameData = input.frames[idx]
      const img = loadedImages[idx] ?? null

      // Top rebate: stock code & frame number
      ctx.fillStyle = '#E8A33D'
      ctx.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillText(`▸ ${frameMark(frameNum)}`, fx + 2, stripY + sprocketBandH + 17)
      ctx.fillStyle = '#8F857A'
      ctx.fillText(input.stockCode, fx + frameW - 64, stripY + sprocketBandH + 17)

      // Frame viewport
      ctx.fillStyle = '#1C1815'
      ctx.fillRect(fx, frameY, frameW, frameH)

      if (img) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(fx, frameY, frameW, frameH)
        ctx.clip()
        drawCoverImage(ctx, img, fx, frameY, frameW, frameH)
        ctx.restore()
      } else {
        ctx.fillStyle = frameData?.exposed ? '#221D19' : '#161311'
        ctx.fillRect(fx, frameY, frameW, frameH)
        ctx.fillStyle = '#5D554D'
        ctx.font = '600 16px ui-monospace, SFMono-Regular, Menlo, monospace'
        const label = frameData?.exposed ? `EXP ${frameMark(frameNum)}` : '—'
        const m = ctx.measureText(label)
        ctx.fillText(label, fx + (frameW - m.width) / 2, frameY + frameH / 2 + 6)
      }

      // Crisp negative border
      ctx.strokeStyle = '#2B2621'
      ctx.lineWidth = 1
      ctx.strokeRect(fx, frameY, frameW, frameH)

      // Bottom rebate
      ctx.fillStyle = '#6E655C'
      ctx.font = '500 11px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.fillText('CHAINROLL · KUB', fx + 2, frameY + frameH + 17)
    }
  }

  // Footer verification line
  const footerY = height - 34
  ctx.fillStyle = '#26221E'
  ctx.fillRect(padX, footerY - 30, innerW, 1)

  ctx.fillStyle = '#E8A33D'
  ctx.font = '600 14px ui-monospace, SFMono-Regular, Menlo, monospace'
  ctx.fillText('VERIFIED ON KUB CHAIN  ·  1 SHOT = 1 TX', padX, footerY)

  const rightText = 'chainroll.art/verify'
  ctx.fillStyle = '#9D9388'
  const rw = ctx.measureText(rightText).width
  ctx.fillText(rightText, width - padX - rw, footerY)

  // Trigger PNG download
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('Failed to encode PNG')

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `chainroll-roll-${String(input.rollId)}-contact-sheet.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}
