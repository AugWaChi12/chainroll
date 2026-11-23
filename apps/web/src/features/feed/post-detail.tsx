'use client'

import { FilmRenderer, getStock, useStockName } from '@/features/film'
import { ConnectSheet, activeChain, useWallet } from '@/features/wallet'
import {
  Badge,
  Button,
  EmptyState,
  RebateLabel,
  TxHash,
  cn,
  truncateHash,
} from '@chainroll/ui'
import {
  Aperture,
  ArrowLeft,
  Check,
  Download,
  Flag,
  Heart,
  Share2,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import type { Route } from 'next'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  deletePost,
  isLikedBy,
  likeCountOf,
  toggleLike,
  useFeedStore,
} from './post-store'
import { PostVisual, frameMark } from './post-visual'
import { getPrintForPost, usePrintMarketStore } from './print-market'
import { PrintMarketPanel } from './print-market-panel'
import { ReportModal } from './report-modal'

export function PostDetailView({ postId }: { postId: string }) {
  const t = useTranslations('feed')
  const format = useFormatter()
  const router = useRouter()
  const stockName = useStockName()
  const { address } = useWallet()
  const { posts } = useFeedStore()
  const { prints } = usePrintMarketStore()

  const [connectOpen, setConnectOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reportedToast, setReportedToast] = useState(false)

  const post = posts.find((p) => p.id === postId)

  if (!post) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 md:px-8">
        <EmptyState
          mark="404"
          title={t('detail.notFoundTitle')}
          description={t('detail.notFoundBody')}
          action={
            <Button variant="primary" asChild>
              <Link href="/feed">{t('detail.backToFeed')}</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const stock = getStock(post.filmId)
  const liked = isLikedBy(post, address)
  const count = likeCountOf(post)
  const print = getPrintForPost(prints, post.id, post.photoHash)
  const isOwner = Boolean(address && address.toLowerCase() === post.shooter.toLowerCase())
  const isCollector = Boolean(print && address && address.toLowerCase() === print.owner.toLowerCase())
  // Once minted as a 1/1 Print NFT, exclusive download rights belong strictly to the current NFT owner
  const canDownload = print ? isCollector : isOwner
  // Once a 1/1 Print is sold to another collector, the photographer can no longer delete it
  const canDelete = isOwner && (!print || print.owner.toLowerCase() === post.shooter.toLowerCase())
  const txBase = activeChain.blockExplorers?.default.url
    ? `${activeChain.blockExplorers.default.url}/tx/`
    : undefined

  const handleDownload = async () => {
    if (!canDownload) return
    const filename = `chainroll-${stock.code.toLowerCase().replace(/\s+/g, '-')}-r${post.rollId}-f${post.frame}`
    const triggerDownload = (href: string, ext: string) => {
      const a = document.createElement('a')
      a.href = href
      a.download = `${filename}.${ext}`
      a.click()
    }

    // Prefer 60-second signed private R2 master download when configured
    try {
      const dlRes = await window.fetch(`/api/prints/${post.photoHash}/download`, {
        cache: 'no-store',
      })
      if (dlRes.ok) {
        const dlData = (await dlRes.json()) as { ok?: boolean; url?: string }
        if (dlData.ok && dlData.url) {
          triggerDownload(dlData.url, 'webp')
          return
        }
      }
    } catch {
      // fallback to local / public source below
    }

    if (post.imageDataUrl) {
      triggerDownload(post.imageDataUrl, 'webp')
      return
    }

    const img = new Image()
    img.src = `/samples/${post.scene ?? 'nature'}.jpg`
    await new Promise<void>((resolve) => {
      img.onload = () => resolve()
      img.onerror = () => resolve()
    })
    if (!img.naturalWidth) return
    try {
      const canvas = document.createElement('canvas')
      const renderer = new FilmRenderer(canvas, { preserveDrawingBuffer: true })
      renderer.setSize(img.naturalWidth, img.naturalHeight)
      renderer.render(img, stock.look, { seed: 0.42 })
      triggerDownload(canvas.toDataURL('image/jpeg', 0.94), 'jpg')
      renderer.dispose()
    } catch {
      triggerDownload(img.src, 'jpg')
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* ignore */
    }
  }

  const handleDelete = () => {
    if (!address) return
    if (deletePost(post.id, address)) {
      router.push('/feed')
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-20 md:px-8">
      <Link
        href="/feed"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" />
        {t('detail.backToFeed')}
      </Link>

      {reportedToast && (
        <div
          role="status"
          className="mb-6 border border-frame/50 bg-bg-raised px-4 py-2.5 text-xs text-fg"
        >
          {t('report.thanks')}
        </div>
      )}

      <div className="grid items-start gap-8 lg:grid-cols-12">
        {/* Frame Visual — sticky on desktop so the photo stays in view while inspecting offers */}
        <div className="mx-auto w-full max-w-md lg:sticky lg:top-20 lg:col-span-6 lg:max-w-none">
          <PostVisual post={post} className="p-3 pb-5 md:p-4 md:pb-6" />
        </div>

        {/* Metadata, 1/1 Print Market, Verification & CTA */}
        <div className="flex min-w-0 flex-col justify-between gap-6 lg:col-span-6">
          <div className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
              <div className="flex flex-col gap-1">
                <RebateLabel>
                  {frameMark(post.frame)} · {stock.code} · #{post.rollId}
                </RebateLabel>
                <Link
                  href={`/u/${post.shooter}` as Route}
                  className="font-display text-2xl text-fg hover:underline"
                >
                  {post.handle ?? truncateHash(post.shooter)}
                </Link>
                <span className="font-mono text-2xs text-fg-subtle">
                  {format.relativeTime(new Date(post.createdAt), new Date())}
                </span>
              </div>
              <Badge tone="success" dot>
                {t('onChainBadge')}
              </Badge>
            </div>

            {post.caption && (
              <p className="text-md leading-relaxed text-fg">{post.caption}</p>
            )}

            {/* Like / Share / Report / Delete */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={liked ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => (address ? toggleLike(post.id, address) : setConnectOpen(true))}
              >
                <Heart className={cn('size-4', liked && 'fill-current')} />
                <span className="font-mono tabular">{format.number(count)}</span>
              </Button>

              <Button variant="secondary" size="sm" onClick={() => void handleCopy()}>
                {copied ? <Check /> : <Share2 />}
                {copied ? t('copied') : t('share')}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => (address ? setReportOpen(true) : setConnectOpen(true))}
              >
                <Flag />
                {t('report.trigger')}
              </Button>

              {canDownload && (
                <Button variant="secondary" size="sm" onClick={() => void handleDownload()}>
                  <Download />
                  {t('detail.download')}
                </Button>
              )}

              {canDelete && (
                <Button variant="danger" size="sm" onClick={handleDelete}>
                  <Trash2 />
                  {t('detail.delete')}
                </Button>
              )}
            </div>

            {/* 1/1 Print NFT & Escrow Offer Market Panel */}
            <PrintMarketPanel
              post={post}
              viewerAddress={address}
              onRequireConnect={() => setConnectOpen(true)}
            />

            {/* On-chain fingerprint verification card */}
            <div className="flex flex-col gap-2.5 border border-border bg-bg-raised p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-frame" />
                <span className="text-xs font-semibold text-fg">
                  {t('detail.proofTitle')}
                </span>
              </div>
              <dl className="flex flex-col divide-y divide-border font-mono text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <dt className="text-fg-muted">{t('detail.fields.shooter')}</dt>
                  <dd>
                    <Link
                      href={`/u/${post.shooter}` as Route}
                      className="text-fg underline decoration-border-strong underline-offset-4 hover:decoration-fg"
                    >
                      {truncateHash(post.shooter)}
                    </Link>
                  </dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <dt className="text-fg-muted">{t('detail.fields.film')}</dt>
                  <dd className="text-fg">
                    {stockName(post.filmId)} (ISO {stock.iso})
                  </dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <dt className="text-fg-muted">{t('detail.fields.rollFrame')}</dt>
                  <dd className="text-frame">
                    #{post.rollId} · ▸ {frameMark(post.frame)}
                  </dd>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <dt className="text-fg-muted">{t('detail.fields.photoHash')}</dt>
                  <dd>
                    <TxHash hash={post.photoHash} />
                  </dd>
                </div>
                {post.txHash && (
                  <div className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <dt className="text-fg-muted">{t('detail.fields.txHash')}</dt>
                    <dd>
                      <TxHash hash={post.txHash} explorerUrl={txBase} />
                    </dd>
                  </div>
                )}
              </dl>
              <p className="text-2xs text-fg-subtle">{t('detail.proofNote')}</p>
            </div>
          </div>

          {/* Acquisition card (§7: ลิงก์ /p/[id] ที่เพื่อนแชร์ → "ถ่ายรูปของคุณ" → /camera) */}
          <div className="flex flex-col gap-3 border border-border-strong bg-bg-raised p-4">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-2xs text-frame">▸ {stock.code}</span>
              <p className="font-display text-lg text-fg">{t('detail.shootYoursTitle')}</p>
              <p className="text-xs text-fg-muted">
                {t('detail.shootYoursBody', { film: stockName(post.filmId) })}
              </p>
            </div>
            <Button variant="primary" size="sm" asChild>
              <Link href={`/camera?film=${post.filmId}`}>
                <Aperture />
                {t('detail.shootYoursCta')}
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <ConnectSheet open={connectOpen} onClose={() => setConnectOpen(false)} />

      {reportOpen && address && (
        <ReportModal
          post={post}
          reporterAddress={address}
          onClose={() => setReportOpen(false)}
          onReported={() => setReportedToast(true)}
        />
      )}
    </div>
  )
}
