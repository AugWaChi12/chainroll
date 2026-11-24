/**
 * Burns a tasteful analog-style ChainRoll watermark onto the PUBLIC feed preview image,
 * while keeping the untouched original Blob in `chainroll-private` for the 1/1 Print owner.
 */
export async function burnFeedWatermark(
  source: Blob,
  opts: {
    photographerLabel: string
    photoHash: string
  },
): Promise<Blob> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return source

  try {
    const bitmap = await createImageBitmap(source)
    try {
      const w = bitmap.width
      const h = bitmap.height
      if (!w || !h) return source

      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return source

      // Draw original photograph
      ctx.drawImage(bitmap, 0, 0, w, h)

      const cleanAuthor = opts.photographerLabel.trim().slice(0, 28) || 'CHAINROLL'
      const shortHash =
        opts.photoHash.length > 14
          ? `${opts.photoHash.slice(0, 8)}…${opts.photoHash.slice(-4)}`
          : opts.photoHash

      // 1. Subtle diagonal anti-screenshot watermark across center
      ctx.save()
      ctx.translate(w / 2, h / 2)
      ctx.rotate((-24 * Math.PI) / 180)
      const diagSize = Math.max(18, Math.round(Math.min(w, h) * 0.045))
      ctx.font = `700 ${diagSize}px ui-monospace, "Courier New", monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
      ctx.shadowBlur = Math.round(diagSize * 0.35)
      ctx.fillStyle = 'rgba(242, 237, 228, 0.24)'
      const diagText = `CHAINROLL  ·  ${cleanAuthor.toUpperCase()}`
      ctx.fillText(diagText, 0, 0)

      // Secondary subtle line below
      const subSize = Math.max(12, Math.round(diagSize * 0.5))
      ctx.font = `600 ${subSize}px ui-monospace, "Courier New", monospace`
      ctx.fillStyle = 'rgba(232, 163, 61, 0.24)'
      ctx.fillText(`VERIFIED ON KUB CHAIN  ·  ${shortHash}`, 0, Math.round(diagSize * 1.15))
      ctx.restore()

      // 2. Crisp bottom-left analog rebate credit stamp
      ctx.save()
      const badgeSize = Math.max(12, Math.round(w * 0.019))
      const padX = Math.round(w * 0.032)
      const padY = Math.round(h * 0.028)
      ctx.font = `700 ${badgeSize}px ui-monospace, "Courier New", monospace`
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.shadowColor = 'rgba(0, 0, 0, 0.78)'
      ctx.shadowBlur = Math.round(badgeSize * 0.45)
      ctx.fillStyle = 'rgba(242, 237, 228, 0.82)'
      ctx.fillText(`▸ CHAINROLL · ${cleanAuthor} · ${shortHash}`, padX, h - padY)
      ctx.restore()

      const mime = source.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp'
      const encoded = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), mime, 0.88),
      )
      return encoded && encoded.size > 0 ? encoded : source
    } finally {
      bitmap.close()
    }
  } catch {
    return source
  }
}
