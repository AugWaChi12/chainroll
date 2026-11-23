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
import { Aperture, Check, Flag, Gavel, Heart, Loader2, Share2, Sparkles, X } from 'lucide-react'
import type { Route } from 'next'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const PAGE_SIZE = 20

type FeedPageResponse = {
  ok: boolean
  items?: FeedPost[]
  nextCursor?: string | null
  totalCount?: number
}

export function FeedView() {
  const t = useTranslations('feed')
  const format = useFormatter()
  const stockName = useStockName()
  const { address } = useWallet()
  const { posts: storePosts } = useFeedStore()
  const { prints, preMintOffers } = usePrintMarketStore()

  const [filmFilter, setFilmFilter] = useState<number | 'all' | 'prints'>('all')
  const [sortBy, setSortBy] = useState<'latest' | 'popular'>('latest')
  const [connectOpen, setConnectOpen] = useState(false)
  const [reportingPost, setReportingPost] = useState<FeedPost | null>(null)
  const [marketPost, setMarketPost] = useState<FeedPost | null>(null)
  const [reportedToast, setReportedToast] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Server-paginated feed state
  const [serverItems, setServerItems] = useState<FeedPost[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [apiReady, setApiReady] = useState(false)
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [localVisibleCount, setLocalVisibleCount] = useState(PAGE_SIZE)

  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadingMoreRef = useRef(false)
  const queryKeyRef = useRef(0)

  const currentQueryKey = `${String(filmFilter)}:${sortBy}`
  const loadingInitial = loadedQueryKey !== currentQueryKey

  const handleFilmFilterChange = (next: number | 'all' | 'prints') => {
    setFilmFilter(next)
    setLocalVisibleCount(PAGE_SIZE)
  }

  const handleSortChange = (next: 'latest' | 'popular') => {
    setSortBy(next)
    setLocalVisibleCount(PAGE_SIZE)
  }

  const buildFeedUrl = useCallback(
    (cursor?: string | null) => {
      const qs = new URLSearchParams()
      qs.set('limit', String(PAGE_SIZE))
      qs.set('sort', sortBy)
      if (filmFilter === 'prints') {
        qs.set('printsOnly', '1')
      } else if (typeof filmFilter === 'number') {
        qs.set('filmId', String(filmFilter))
      }
      if (cursor) qs.set('cursor', cursor)
      return `/api/feed?${qs.toString()}`
    },
    [filmFilter, sortBy],
  )

  // Fetch initial page (20 posts) whenever filter or sort changes
  useEffect(() => {
    const reqId = ++queryKeyRef.current
    const controller = new AbortController()
    loadingMoreRef.current = false

    void fetch(buildFeedUrl(null), { signal: controller.signal, cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<FeedPageResponse>) : null))
      .then((data) => {
        if (reqId !== queryKeyRef.current) return
        if (data?.ok && Array.isArray(data.items)) {
          setServerItems(data.items)
          setNextCursor(data.nextCursor ?? null)
          setTotalCount(typeof data.totalCount === 'number' ? data.totalCount : data.items.length)
          setApiReady(true)
        }
      })
      .catch(() => {
        /* fallback gracefully to local storePosts when offline */
      })
      .finally(() => {
        if (reqId === queryKeyRef.current) {
          setLoadedQueryKey(currentQueryKey)
        }
      })

    return () => controller.abort()
  }, [buildFeedUrl, currentQueryKey])

  // Load next batch of 20 posts
  const loadMore = useCallback(() => {
    if (!apiReady) {
      setLocalVisibleCount((n) => n + PAGE_SIZE)
      return
    }
    if (!nextCursor || loadingMoreRef.current) return
    const reqId = queryKeyRef.current
    loadingMoreRef.current = true
    setLoadingMore(true)

    void fetch(buildFeedUrl(nextCursor), { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<FeedPageResponse>) : null))
      .then((data) => {
        if (reqId !== queryKeyRef.current) return
        if (data?.ok && Array.isArray(data.items)) {
          setServerItems((prev) => {
            const seen = new Set(prev.map((p) => p.id))
            const appended = data.items!.filter((p) => !seen.has(p.id))
            return [...prev, ...appended]
          })
          setNextCursor(data.nextCursor ?? null)
          if (typeof data.totalCount === 'number') {
            setTotalCount(data.totalCount)
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (reqId === queryKeyRef.current) {
          loadingMoreRef.current = false
          setLoadingMore(false)
        }
      })
  }, [apiReady, nextCursor, buildFeedUrl])

  // Local fallback list (used before API responds or offline)
  const localFiltered = useMemo(() => {
    const byFilm =
      filmFilter === 'all'
        ? storePosts
        : filmFilter === 'prints'
          ? storePosts.filter((p) => Boolean(getPrintForPost(prints, p.id, p.photoHash)))
          : storePosts.filter((p) => p.filmId === filmFilter)
    return [...byFilm].sort((a, b) =>
      sortBy === 'popular' ? likeCountOf(b) - likeCountOf(a) : b.createdAt - a.createdAt,
    )
  }, [storePosts, prints, filmFilter, sortBy])

  // Merge paginated server items with live optimistic local mutations (likes, reports, newly posted frames)
  const visiblePosts = useMemo(() => {
    if (!apiReady) {
      return localFiltered.slice(0, localVisibleCount)
    }

    const storeById = new Map(storePosts.map((p) => [p.id, p]))
    const merged = serverItems.map((item) => {
      const local = storeById.get(item.id)
      if (!local) return item
      return {
        ...item,
        likes: local.likes,
        reports: local.reports,
        handle: local.handle ?? item.handle,
      }
    })

    // Prepend any newly created local posts not yet present in serverItems
    const seen = new Set(merged.map((p) => p.id))
    const freshLocal = localFiltered.filter(
      (p) => !seen.has(p.id) && (merged.length === 0 || p.createdAt > merged[0]!.createdAt),
    )
    return freshLocal.length > 0 ? [...freshLocal, ...merged] : merged
  }, [apiReady, serverItems, storePosts, localFiltered, localVisibleCount])

  const effectiveTotal = apiReady
    ? Math.max(totalCount ?? visiblePosts.length, visiblePosts.length)
    : localFiltered.length

  const hasMore = apiReady ? Boolean(nextCursor) : visiblePosts.length < localFiltered.length

  // Background prefetch via IntersectionObserver (600px before bottom)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMore()
        }
      },
      { rootMargin: '600px 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loadMore, visiblePosts.length])

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
    <div className="mx-auto max-w-6xl px-3.5 pt-5 pb-16 sm:px-4 sm:pt-10 sm:pb-20 md:px-8">
      <header className="mb-4 flex flex-col gap-3 border-b border-border pb-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:pb-6">
        <div className="flex items-start justify-between gap-3 sm:block">
          <div className="flex flex-col gap-1 sm:gap-1.5">
            <span className="font-mono text-2xs tracking-wide text-frame">▸ {t('eyebrow')}</span>
            <h1 className="font-display text-2xl leading-none sm:text-3xl md:text-4xl">
              {t('title')}
            </h1>
          </div>
          <Button variant="primary" size="sm" className="shrink-0 sm:hidden" asChild>
            <Link href="/camera">
              <Aperture />
              {t('cta')}
            </Link>
          </Button>
        </div>
        <p className="max-w-xl text-xs leading-relaxed text-fg-muted sm:hidden">{t('subtitle')}</p>
        <div className="hidden sm:flex sm:flex-1 sm:items-end sm:justify-between sm:gap-4">
          <p className="max-w-xl text-sm text-fg-muted">{t('subtitle')}</p>
          <Button variant="primary" size="sm" className="shrink-0" asChild>
            <Link href="/camera">
              <Aperture />
              {t('cta')}
            </Link>
          </Button>
        </div>
      </header>

      {/* Filter & sort bar — single scrollable strip on mobile, clean wrap on desktop */}
      <div className="mb-5 flex flex-col gap-2.5 sm:mb-8 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <div
          className="-mx-3.5 flex flex-nowrap gap-1.5 overflow-x-auto px-3.5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label={t('filterFilm')}
        >
          <button
            type="button"
            role="tab"
            aria-selected={filmFilter === 'all'}
            onClick={() => handleFilmFilterChange('all')}
            className={cn(
              'h-8 shrink-0 rounded-xs border px-3 font-mono text-xs whitespace-nowrap transition-colors duration-[var(--dur-fast)]',
              filmFilter === 'all'
                ? 'border-border-strong bg-bg-sunken text-fg'
                : 'border-border bg-bg-raised text-fg-muted hover:text-fg',
            )}
          >
            {t('allFilms')}
            {filmFilter === 'all' ? ` (${effectiveTotal})` : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filmFilter === 'prints'}
            onClick={() => handleFilmFilterChange('prints')}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xs border px-3 font-mono text-xs whitespace-nowrap transition-colors duration-[var(--dur-fast)]',
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
              onClick={() => handleFilmFilterChange(s.id)}
              className={cn(
                'h-8 shrink-0 rounded-xs border px-3 font-mono text-xs whitespace-nowrap transition-colors duration-[var(--dur-fast)]',
                filmFilter === s.id
                  ? 'border-border-strong bg-bg-sunken text-fg'
                  : 'border-border bg-bg-raised text-fg-muted hover:text-fg',
              )}
            >
              {stockName(s.id)}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <span className="font-mono text-2xs tabular text-fg-subtle sm:hidden">
            {t('showingCount', { shown: visiblePosts.length, total: effectiveTotal })}
          </span>
          <div className="flex items-center gap-1.5 font-mono text-xs">
            {(['latest', 'popular'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => handleSortChange(mode)}
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
      </div>

      {reportedToast && (
        <div
          role="status"
          className="mb-5 flex items-center justify-between border border-frame/50 bg-bg-raised px-3.5 py-2.5 text-xs text-fg sm:mb-6 sm:px-4"
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

      {visiblePosts.length === 0 && !loadingInitial ? (
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
        <>
          {/* Asymmetric editorial gallery on md+, clean single-column rhythm on mobile */}
          <ul className="grid gap-y-9 sm:gap-y-12 md:grid-cols-12 md:gap-x-8 md:gap-y-14">
            {visiblePosts.map((post, idx) => {
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
                  <article className="flex flex-col gap-2.5 sm:gap-3">
                    <Link href={`/p/${post.id}` as Route} className="group block">
                      <PostVisual
                        post={post}
                        imgClassName="transition-transform duration-[var(--dur-slow)] group-hover:scale-[1.015]"
                      />
                    </Link>

                    <div className="flex flex-col gap-2 px-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Link
                            href={`/u/${post.shooter}` as Route}
                            className="truncate text-sm font-medium text-fg hover:underline"
                          >
                            {post.handle ?? truncateHash(post.shooter)}
                          </Link>
                          <RebateLabel className="shrink-0">
                            {frameMark(post.frame)} · {stockName(post.filmId)}
                          </RebateLabel>
                        </div>
                        <span className="shrink-0 font-mono text-2xs tabular text-fg-subtle">
                          {format.relativeTime(new Date(post.createdAt), new Date())}
                        </span>
                      </div>

                      {post.caption && (
                        <Link
                          href={`/p/${post.id}` as Route}
                          className="line-clamp-3 text-sm leading-relaxed text-fg hover:text-fg-muted sm:line-clamp-none"
                        >
                          {post.caption}
                        </Link>
                      )}

                      <div className="mt-0.5 flex items-center justify-between gap-2 border-t border-border pt-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleLike(post)}
                            aria-pressed={liked}
                            aria-label={t('like')}
                            className={cn(
                              'inline-flex h-8 items-center gap-1.5 rounded-xs border px-2.5 font-mono text-xs tabular transition-colors duration-[var(--dur-fast)] sm:h-7',
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
                            className="inline-flex h-8 items-center gap-1.5 rounded-xs border border-border bg-bg-raised px-2.5 font-mono text-2xs text-fg-muted hover:border-border-strong hover:text-fg sm:h-7"
                          >
                            {copiedId === post.id ? (
                              <>
                                <Check className="size-3.5 text-success sm:size-3" />
                                <span className="hidden sm:inline">{t('copied')}</span>
                              </>
                            ) : (
                              <>
                                <Share2 className="size-3.5 sm:size-3" />
                                <span className="hidden sm:inline">{t('share')}</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleReportClick(post)}
                            aria-label={t('report.trigger')}
                            className="inline-flex h-8 items-center rounded-xs px-2 text-fg-subtle hover:bg-bg-sunken hover:text-danger sm:h-7"
                          >
                            <Flag className="size-3.5" />
                          </button>
                        </div>

                        <div className="flex min-w-0 items-center gap-2">
                          {print ? (
                            <button
                              type="button"
                              onClick={() => setMarketPost(post)}
                              className="inline-flex h-8 max-w-full items-center gap-1.5 truncate rounded-xs border border-frame/60 bg-bg-raised px-2.5 font-mono text-2xs text-frame transition-colors hover:bg-bg-sunken sm:h-7"
                            >
                              <Gavel className="size-3 shrink-0" />
                              <span className="truncate">
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
                                    'inline-flex h-8 max-w-full items-center gap-1 truncate rounded-xs border px-2.5 font-mono text-2xs transition-colors sm:h-7',
                                    topPre
                                      ? 'border-frame/60 bg-frame/10 text-frame hover:bg-frame/20'
                                      : 'border-border-strong bg-bg-raised text-fg-muted hover:border-frame hover:text-frame',
                                  )}
                                >
                                  {isMyPost ? (
                                    <Sparkles className="size-3 shrink-0 text-frame" />
                                  ) : (
                                    <Gavel className="size-3 shrink-0" />
                                  )}
                                  <span className="truncate">
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
                          <span className="hidden sm:inline-flex">
                            <TxHash hash={post.photoHash} />
                          </span>
                        </div>
                      </div>
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>

          {/* Infinite scroll prefetch sentinel & status footer */}
          <div
            ref={sentinelRef}
            className="mt-10 flex flex-col items-center justify-center gap-3 border-t border-border pt-6 sm:mt-14"
          >
            {loadingMore || loadingInitial ? (
              <div className="inline-flex items-center gap-2 font-mono text-xs text-fg-muted">
                <Loader2 className="size-3.5 animate-spin text-frame" />
                <span>{t('loadingMore')}</span>
              </div>
            ) : hasMore ? (
              <Button variant="secondary" size="sm" onClick={loadMore}>
                {t('loadMore')}
              </Button>
            ) : (
              <p className="font-mono text-2xs text-fg-subtle">
                ▸ {t('endOfFeed', { count: effectiveTotal })}
              </p>
            )}
          </div>
        </>
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
