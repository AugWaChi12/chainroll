'use client'

import { FilmPreview, SAMPLE_SCENES, getStock } from '@/features/film'
import { useWallet } from '@/features/wallet'
import { Button, Input, RebateLabel, TxHash, cn } from '@chainroll/ui'
import { Check, ExternalLink, Send, X } from 'lucide-react'
import type { Route } from 'next'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useState } from 'react'
import {
  blobToDataUrl,
  createPost,
  getProfileMeta,
  useFeedStore,
  type FeedPost,
} from './post-store'
import { frameMark } from './post-visual'
import { burnFeedWatermark } from './watermark'

export type PublishableFrame = {
  frame: number
  hash: string
  txHash?: string
  url?: string
  blob?: Blob
}

export function PostComposerModal({
  rollId,
  filmId,
  shooter,
  frames,
  initialFrame,
  onClose,
}: {
  rollId: number
  filmId: number
  shooter: string
  frames: PublishableFrame[]
  initialFrame?: number
  onClose: () => void
}) {
  const t = useTranslations('feed.composer')
  const wallet = useWallet()
  const { posts } = useFeedStore()
  const stock = getStock(filmId)

  const [selectedFrame, setSelectedFrame] = useState<number>(
    initialFrame ?? frames[0]?.frame ?? 1,
  )
  const active = frames.find((f) => f.frame === selectedFrame) ?? frames[0]

  const existingPost = active
    ? posts.find((p) => p.photoHash.toLowerCase() === active.hash.toLowerCase())
    : undefined

  const [caption, setCaption] = useState<string>(existingPost?.caption ?? '')
  const [saving, setSaving] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [published, setPublished] = useState<FeedPost | null>(null)

  if (!active) return null

  const selectFrame = (f: PublishableFrame) => {
    setSelectedFrame(f.frame)
    const found = posts.find((p) => p.photoHash.toLowerCase() === f.hash.toLowerCase())
    setCaption(found?.caption ?? '')
    setPublishError(null)
    setPublished(null)
  }

  const handlePublish = async () => {
    setSaving(true)
    setPublishError(null)
    try {
      // 1. Ensure verified SIWE session so R2 presigned upload & Postgres write never 401 silently
      if (!wallet.authenticated) {
        const ok = await wallet.signIn()
        if (!ok) {
          setPublishError('กรุณากดเซ็นยืนยันกระเป๋า (SIWE) ก่อนโพสต์ลงฟีด')
          return
        }
      }

      let imageDataUrl: string | undefined
      let uploadBlob: Blob | undefined =
        active.blob && active.blob.size > 0 ? active.blob : undefined

      // Cross-device publish: if frame came from Private R2 sync, fetch its real WebP bytes first
      if (!uploadBlob && active.url && active.url.startsWith('/api/rolls/')) {
        try {
          const frameRes = await window.fetch(active.url, { cache: 'no-store' })
          if (frameRes.ok) {
            const fetched = await frameRes.blob()
            if (fetched.size > 0) uploadBlob = fetched
          }
        } catch {
          // ignore fetch error; fallback handled below
        }
      } else if (!uploadBlob && active.url && active.url.startsWith('https://')) {
        imageDataUrl = active.url
      }

      if (uploadBlob) {
        // 2. Burn analog watermark onto the PUBLIC feed preview while keeping the CLEAN original for 1/1 Print master
        const profile = getProfileMeta(shooter)
        const photographerLabel = profile.handle
          ? `@${profile.handle}`
          : `${shooter.slice(0, 6)}…${shooter.slice(-4)}`
        const publicBlob = await burnFeedWatermark(uploadBlob, {
          photographerLabel,
          photoHash: active.hash,
        })

        // 3. Direct browser -> Cloudflare R2 presigned upload (watermarked public CDN + clean private 1/1 master)
        const contentType =
          uploadBlob.type === 'image/jpeg' ? 'image/jpeg' : ('image/webp' as const)
        try {
          const signRes = await window.fetch('/api/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              photoHash: active.hash,
              contentType,
              bytes: Math.max(uploadBlob.size, publicBlob.size),
            }),
          })
          if (signRes.ok) {
            const signed = (await signRes.json()) as {
              ok?: boolean
              publicPutUrl?: string
              privatePutUrl?: string
              publicUrl?: string
            }
            if (signed.ok && signed.publicPutUrl && signed.privatePutUrl && signed.publicUrl) {
              const [pubUp, privUp] = await Promise.all([
                window.fetch(signed.publicPutUrl, {
                  method: 'PUT',
                  headers: { 'Content-Type': contentType },
                  body: publicBlob,
                }),
                window.fetch(signed.privatePutUrl, {
                  method: 'PUT',
                  headers: { 'Content-Type': contentType },
                  body: uploadBlob,
                }),
              ])
              if (pubUp.ok && privUp.ok) {
                imageDataUrl = signed.publicUrl
              }
            }
          }
        } catch {
          // fallback to compressed data URL when R2 is not configured
        }
        if (!imageDataUrl) {
          imageDataUrl = await blobToDataUrl(publicBlob)
        }
      }

      const fallbackScene = SAMPLE_SCENES[(active.frame - 1) % SAMPLE_SCENES.length]
      const post = createPost({
        shooter,
        rollId,
        frame: active.frame,
        filmId,
        photoHash: active.hash,
        txHash: active.txHash,
        caption,
        imageDataUrl,
        scene: fallbackScene,
      })

      // 3. Verify server persistence explicitly so failures never fail silently
      const persistRes = await window.fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'post.create', post }),
      })
      if (!persistRes.ok) {
        const errData = (await persistRes.json().catch(() => null)) as { error?: string } | null
        setPublishError(errData?.error ?? `บันทึกโพสต์ไม่สำเร็จ (HTTP ${persistRes.status})`)
        return
      }

      setPublished(post)
    } catch {
      setPublishError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-md border border-border-strong bg-bg-raised p-5 shadow-[var(--elev-pop)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-border pb-3">
          <div className="flex flex-col gap-1">
            <RebateLabel>
              {stock.code} · #{rollId}
            </RebateLabel>
            <h2 className="font-display text-2xl text-fg">{t('title')}</h2>
            <p className="text-xs text-fg-muted">{t('subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="rounded-xs p-1 text-fg-muted hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Frame strip picker */}
        {frames.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
              {t('pickFrame')}
            </span>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {frames.map((f) => {
                const isPosted = posts.some(
                  (p) => p.photoHash.toLowerCase() === f.hash.toLowerCase(),
                )
                const isCurrent = f.frame === active.frame
                return (
                  <button
                    key={f.frame}
                    type="button"
                    onClick={() => selectFrame(f)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-xs border px-2.5 py-1.5 font-mono text-xs transition-colors duration-[var(--dur-fast)]',
                      isCurrent
                        ? 'border-frame bg-bg-sunken text-frame'
                        : 'border-border bg-bg text-fg-muted hover:text-fg',
                    )}
                  >
                    <span>▸ {frameMark(f.frame)}</span>
                    {isPosted && <Check className="size-3 text-success" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-12">
          {/* Selected frame preview */}
          <div className="bg-[#0e0c0b] p-2.5 pb-4 md:col-span-5">
            {active.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob: URL from IndexedDB
              <img
                src={active.url}
                alt=""
                className="aspect-[2/3] w-full object-cover"
              />
            ) : (
              <FilmPreview
                look={stock.look}
                scene={SAMPLE_SCENES[(active.frame - 1) % SAMPLE_SCENES.length]}
                className="aspect-[2/3] w-full"
              />
            )}
            <div className="mt-2 flex items-center justify-between font-mono text-[10px] tracking-[0.2em] text-frame/85">
              <span>▸ {frameMark(active.frame)}</span>
              <span>{stock.code}</span>
            </div>
          </div>

          {/* Caption & metadata */}
          <div className="flex flex-col justify-between gap-4 md:col-span-7">
            <div className="flex flex-col gap-3">
              <Input
                label={t('captionLabel')}
                placeholder={t('captionPlaceholder')}
                value={caption}
                maxLength={240}
                onChange={(e) => setCaption(e.target.value)}
              />

              <dl className="grid grid-cols-2 gap-2 border border-border bg-bg p-3 font-mono text-xs">
                <div>
                  <dt className="text-2xs text-fg-subtle">{t('fields.frame')}</dt>
                  <dd className="text-frame">
                    ▸ {frameMark(active.frame)} (#{rollId})
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs text-fg-subtle">{t('fields.film')}</dt>
                  <dd className="text-fg">{stock.name}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-2xs text-fg-subtle">{t('fields.hash')}</dt>
                  <dd>
                    <TxHash hash={active.hash} />
                  </dd>
                </div>
              </dl>

              <p className="text-2xs text-fg-subtle">{t('privacyNote')}</p>

              {publishError && (
                <div
                  role="alert"
                  className="border border-danger/50 bg-danger/10 px-3 py-2 text-xs text-danger"
                >
                  {publishError}
                </div>
              )}
            </div>

            {published ? (
              <div className="flex flex-wrap items-center justify-between gap-2 border border-success/40 bg-bg p-3">
                <span className="text-xs font-medium text-success">{t('publishedOk')}</span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" asChild>
                    <Link href={`/p/${published.id}` as Route}>
                      <ExternalLink />
                      {t('viewPost')}
                    </Link>
                  </Button>
                  <Button variant="primary" size="sm" asChild>
                    <Link href="/feed">{t('goToFeed')}</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2 border-t border-border pt-3">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  {t('close')}
                </Button>
                <Button variant="primary" size="sm" disabled={saving} onClick={handlePublish}>
                  <Send />
                  {saving
                    ? t('publishing')
                    : existingPost
                      ? t('updatePost')
                      : t('publishBtn')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
