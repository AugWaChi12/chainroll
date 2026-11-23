'use client'

import { FILM_STOCKS, useStockName } from '@/features/film'
import { ConnectSheet, useWallet } from '@/features/wallet'
import {
  Button,
  EmptyState,
  RebateLabel,
  TxHash,
  cn,
  truncateHash,
} from '@chainroll/ui'
import { Aperture, Check, Flag, Gavel, Heart, Share2, Sparkles, X } from 'lucide-react'
import type { Route } from 'next'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  isLikedBy,
  likeCountOf,
  toggleLike,
  useFeedStore,
  type FeedPost,
} from './post-store'
import { PostVisual, frameMark } from './post-visual'
import {
  getPrintForPost,
  highestOfferOf,
  highestPreMintOfferOf,
  usePrintMarketStore,
} from './print-market'
import { PrintMarketPanel } from './print-market-panel'
import { ReportModal } from './report-modal'

export function FeedView() {
  const t = useTranslations('feed')
  const format = useFormatter()
  const stockName = useStockName()
  const { address } = useWallet()
  const { posts } = useFeedStore()
  const { prints, preMintOffers } = usePrintMarketStore()

  const [filmFilter, setFilmFilter] = useState<number | 'all' | 'prints'>('all')
  const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest')
  const [connectOpen, setConnectOpen] = useState(false)
  const [reportingPost, setReportingPost] = useState<FeedPost | null>(null)
  const [marketPost, setMarketPost] = useState<FeedPost | null>(null)
  const [reportedToast, setReportedToast] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const byFilm =
      filmFilter === 'all'
        ? posts
        : filmFilter === 'prints'
          ? posts.filter((p) => Boolean(getPrintForPost(prints, p.id, p.photoHash)))
          : posts.filter((p) => p.filmId === filmFilter)
    return [...byFilm].sort((a, b) =>
      sortBy === 'popular' ? likeCountOf(b) - likeCountOf(a) : b.createdAt - a.createdAt,
    )
  }, [posts, prints, filmFilter, sortBy])

  const handleLike = (post: FeedPost) => {
    if (!address) {
      setConnectOpen(true)
      return
    }
    toggleLike(post.id, address)
  }

  const handleReportClick = (post: FeedPost) => {
    if (!address) {
      setConnectOpen(true)
      return
    }
    setReportingPost(post)
  }

  const handleCopyLink = async (postId: string) => {
    try {
      const url = `${window.location.origin}/p/${postId}`
      await navigator.clipboard.writeText(url)
      setCopiedId(postId)
      window.setTimeout(() => setCopiedId(null), 1500)
    } catch {
      /* ignore clipboard error */
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-20 md:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-2xs tracking-wide text-frame">▸ {t('eyebrow')}</span>
          <h1 className="font-display text-3xl leading-none md:text-4xl">{t('title')}</h1>
          <p className="max-w-xl text-sm text-fg-muted">{t('subtitle')}</p>
        </div>
        <Button variant="primary" size="sm" asChild>
          <Link href="/camera">
            <Aperture />
            {t('cta')}
          </Link>
        </Button>
      </header>

      {/* Filter & sort bar */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('filterFilm')}>
          <button
            type="button"
            role="tab"
            aria-selected={filmFilter === 'all'}
            onClick={() => setFilmFilter('all')}
            className={cn(
              'h-8 rounded-xs border px-3 font-mono text-xs transition-colors duration-[var(--dur-fast)]',
              filmFilter === 'all'
                ? 'border-border-strong bg-bg-sunken text-fg'
                : 'border-border bg-bg-raised text-fg-muted hover:text-fg',
            )}
          >
            {t('allFilms')} ({posts.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filmFilter === 'prints'}
            onClick={() => setFilmFilter('prints')}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-xs border px-3 font-mono text-xs transition-colors duration-[var(--dur-fast)]',
              filmFilter === 'prints'
                ? 'border-frame bg-bg-sunken text-frame'
                : 'border-border bg-bg-raised text-fg-muted hover:text-fg',
            )}
          >
            <Sparkles className="size-3 text-frame" />
            {t('market.printsTab')} ({prints.length})
          </button>
          {FILM_STOCKS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={filmFilter === s.id}
              onClick={() => setFilmFilter(s.id)}
              className={cn(
                'h-8 rounded-xs border px-3 font-mono text-xs transition-colors duration-[var(--dur-fast)]',
                filmFilter === s.id
                  ? 'border-border-strong bg-bg-sunken text-fg'
                  : 'border-border bg-bg-raised text-fg-muted hover:text-fg',
              )}
            >
              {stockName(s.id)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 font-mono text-xs">
          {(['latest', 'popular'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortBy(mode)}
              className={cn(
                'h-8 rounded-xs border px-2.5 transition-colors duration-[var(--dur-fast)]',
                sortBy === mode
                  ? 'border-border-strong bg-bg-sunken text-fg'
                  : 'border-border bg-bg-raised text-fg-muted hover:text-fg',
              )}
            >
              {t(`sort.${mode}`)}
            </button>
          ))}
        </div>
      </div>

      {reportedToast && (
        <div
          role="status"
          className="mb-6 flex items-center justify-between border border-frame/50 bg-bg-raised px-4 py-2.5 text-xs text-fg"
        >
          <span>{reportedToast}</span>
          <button
            type="button"
            onClick={() => setReportedToast(null)}
            className="font-mono text-2xs text-fg-muted underline"
          >
            {t('dismiss')}
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          mark="00"
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={
            <Button variant="secondary" size="sm" onClick={() => setFilmFilter('all')}>
              {t('allFilms')}
            </Button>
          }
        />
      ) : (
        /* Asymmetric editorial gallery (§9.9: sizes and vertical offsets vary) */
        <ul className="grid gap-x-8 gap-y-14 md:grid-cols-12">
          {filtered.map((post, idx) => {
            const isLarge = idx % 3 === 0
            const offset = idx % 3 === 1 ? 'md:mt-14' : idx % 3 === 2 ? 'md:mt-6' : ''
            const liked = isLikedBy(post, address)
            const count = likeCountOf(post)
            const print = getPrintForPost(prints, post.id, post.photoHash)
            const topOffer = highestOfferOf(print)
            const isMyPost = Boolean(
              address && address.toLowerCase() === post.shooter.toLowerCase(),
            )

            return (
              <li
                key={post.id}
                className={cn(isLarge ? 'md:col-span-7' : 'md:col-span-5', offset)}
              >
                <article className="flex flex-col gap-3">
                  <Link href={`/p/${post.id}` as Route} className="group block">
                    <PostVisual
                      post={post}
                      imgClassName="transition-transform duration-[var(--dur-slow)] group-hover:scale-[1.015]"
                    />
                  </Link>

                  <div className="flex flex-col gap-2 px-0.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/u/${post.shooter}` as Route}
                          className="text-sm font-medium text-fg hover:underline"
                        >
                          {post.handle ?? truncateHash(post.shooter)}
                        </Link>
                        <RebateLabel>
                          {frameMark(post.frame)} · {stockName(post.filmId)}
                        </RebateLabel>
                      </div>
                      <span className="font-mono text-2xs tabular text-fg-subtle">
                        {format.relativeTime(new Date(post.createdAt), new Date())}
                      </span>
                    </div>

                    {post.caption && (
                      <Link
                        href={`/p/${post.id}` as Route}
                        className="text-sm leading-relaxed text-fg hover:text-fg-muted"
                      >
                        {post.caption}
                      </Link>
                    )}

                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleLike(post)}
                          aria-pressed={liked}
                          aria-label={t('like')}
                          className={cn(
                            'inline-flex h-7 items-center gap-1.5 rounded-xs border px-2.5 font-mono text-xs tabular transition-colors duration-[var(--dur-fast)]',
                            liked
                              ? 'border-accent/50 bg-accent/10 text-accent'
                              : 'border-border bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg',
                          )}
                        >
                          <Heart className={cn('size-3.5', liked && 'fill-current')} />
                          <span>{format.number(count)}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleCopyLink(post.id)}
                          aria-label={t('share')}
                          className="inline-flex h-7 items-center gap-1.5 rounded-xs border border-border bg-bg-raised px-2.5 font-mono text-2xs text-fg-muted hover:border-border-strong hover:text-fg"
                        >
                          {copiedId === post.id ? (
                            <>
                              <Check className="size-3 text-success" />
                              <span>{t('copied')}</span>
                            </>
                          ) : (
                            <>
                              <Share2 className="size-3" />
                              <span>{t('share')}</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleReportClick(post)}
                          aria-label={t('report.trigger')}
                          className="inline-flex h-7 items-center rounded-xs px-2 text-fg-subtle hover:bg-bg-sunken hover:text-danger"
                        >
                          <Flag className="size-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {print ? (
                          <button
                            type="button"
                            onClick={() => setMarketPost(post)}
                            className="inline-flex h-7 items-center gap-1.5 rounded-xs border border-frame/60 bg-bg-raised px-2.5 font-mono text-2xs text-frame transition-colors hover:bg-bg-sunken"
                          >
                            <Gavel className="size-3" />
                            <span>
                              1/1 #{String(print.tokenId).padStart(2, '0')}
                              {print.askPriceKub
                                ? ` · ${print.askPriceKub.toFixed(1)} KUB`
                                : topOffer
                                  ? ` · ${t('market.topBidShort', { amount: topOffer.amountKub.toFixed(1) })}`
                                  : ` · ${t('market.offerBtnShort')}`}
                            </span>
                          </button>
                        ) : (
                          (() => {
                            const topPre = highestPreMintOfferOf(preMintOffers, post.photoHash)
                            return (
                              <button
                                type="button"
                                onClick={() => setMarketPost(post)}
                                className={cn(
                                  'inline-flex h-7 items-center gap-1 rounded-xs border px-2.5 font-mono text-2xs transition-colors',
                                  topPre
                                    ? 'border-frame/60 bg-frame/10 text-frame hover:bg-frame/20'
                                    : 'border-border-strong bg-bg-raised text-fg-muted hover:border-frame hover:text-frame',
                                )}
                              >
                                {isMyPost ? (
                                  <Sparkles className="size-3 text-frame" />
                                ) : (
                                  <Gavel className="size-3" />
                                )}
                                <span>
                                  {topPre
                                    ? t('market.preMintOfferShort', {
                                        amount: topPre.amountKub.toFixed(1),
                                      })
                                    : isMyPost
                                      ? t('market.mintShort')
                                      : t('market.offerBtnShort')}
                                </span>
                              </button>
                            )
                          })()
                        )}
                        <TxHash hash={post.photoHash} />
                      </div>
                    </div>
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}

      <ConnectSheet open={connectOpen} onClose={() => setConnectOpen(false)} />

      {marketPost && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('market.modalTitle')}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6"
          onClick={() => setMarketPost(null)}
        >
          <div
            className="flex max-h-[90dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-md border border-border-strong bg-bg p-4 shadow-[var(--elev-pop)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-frame">
                ▸ {frameMark(marketPost.frame)} · {stockName(marketPost.filmId)}
              </span>
              <button
                type="button"
                onClick={() => setMarketPost(null)}
                aria-label={t('market.close')}
                className="rounded-xs p-1 text-fg-muted hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>
            <PrintMarketPanel
              post={marketPost}
              viewerAddress={address}
              onRequireConnect={() => setConnectOpen(true)}
            />
          </div>
        </div>
      )}

      {reportingPost && address && (
        <ReportModal
          post={reportingPost}
          reporterAddress={address}
          onClose={() => setReportingPost(null)}
          onReported={() => setReportedToast(t('report.thanks'))}
        />
      )}
    </div>
  )
}
