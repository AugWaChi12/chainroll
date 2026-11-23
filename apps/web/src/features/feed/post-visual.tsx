'use client'

import { FilmPreview, getStock } from '@/features/film'
import { cn, truncateHash } from '@chainroll/ui'
import { ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { frameMark, type FeedPost } from './post-store'

export { frameMark }

/**
 * Renders a user's `data:` URL photo onto a `<canvas>` rather than an `<img>` element
 * so there is no `<img>` source in the DOM to right-click "Save Image As" or "Copy Image".
 */
function ProtectedPhotoCanvas({
  src,
  className,
}: {
  src: string
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let alive = true
    const img = new Image()
    img.onload = () => {
      if (!alive || !ref.current) return
      const c = ref.current
      c.width = img.naturalWidth || 800
      c.height = img.naturalHeight || 1200
      const g = c.getContext('2d')
      if (!g) return
      g.drawImage(img, 0, 0, c.width, c.height)
    }
    img.src = src
    return () => {
      alive = false
    }
  }, [src])

  return <canvas ref={ref} className={className} role="img" aria-hidden />
}

export function PostVisual({
  post,
  className,
  imgClassName,
}: {
  post: FeedPost
  className?: string
  imgClassName?: string
}) {
  const stock = getStock(post.filmId)
  const [shieldNotice, setShieldNotice] = useState(false)

  const triggerShield = () => {
    setShieldNotice(true)
    window.setTimeout(() => setShieldNotice(false), 1800)
  }

  return (
    <div
      data-protected-frame
      onContextMenu={(e) => {
        e.preventDefault()
        triggerShield()
      }}
      onDragStart={(e) => e.preventDefault()}
      className={cn(
        'relative select-none bg-[#0e0c0b] p-2.5 pb-4 [-webkit-touch-callout:none]',
        className,
      )}
    >
      <div className="relative overflow-hidden">
        {post.imageDataUrl ? (
          <ProtectedPhotoCanvas
            src={post.imageDataUrl}
            className={cn('pointer-events-none block aspect-[2/3] w-full object-cover', imgClassName)}
          />
        ) : (
          <FilmPreview
            look={stock.look}
            scene={post.scene ?? 'nature'}
            className={cn('pointer-events-none block aspect-[2/3] w-full', imgClassName)}
          />
        )}

        {/* Transparent anti-copy shield layer over the canvas */}
        <div
          aria-hidden
          className="absolute inset-0 z-10 select-none bg-transparent"
          onContextMenu={(e) => {
            e.preventDefault()
            triggerShield()
          }}
        />

        {/* Dynamic provenance stamp shown when someone tries to right-click/save */}
        {shieldNotice && (
          <div
            role="status"
            className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex items-center justify-between gap-2 border border-frame/60 bg-black/85 px-3 py-2 font-mono text-2xs text-frame backdrop-blur-xs"
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 shrink-0" />
              <span>PROTECTED 1/1 FRAME</span>
            </span>
            <span className="text-white/75">{truncateHash(post.photoHash)}</span>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between font-mono text-[10px] tracking-[0.2em] text-frame/85">
        <span>▸ {frameMark(post.frame)}</span>
        <span>
          {stock.code} · #{post.rollId}
        </span>
      </div>
    </div>
  )
}
