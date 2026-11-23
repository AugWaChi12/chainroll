'use client'

import { useStockName } from '@/features/film'
import { useWallet } from '@/features/wallet'
import {
  Badge,
  Button,
  EmptyState,
  Input,
  KPIGrid,
  KPIStat,
  RebateLabel,
  TxHash,
  cn,
  truncateHash,
} from '@chainroll/ui'
import {
  Aperture,
  ArrowLeft,
  Check,
  ExternalLink,
  Gavel,
  Heart,
  Pencil,
  Sparkles,
  X,
} from 'lucide-react'
import type { Route } from 'next'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  getProfileMeta,
  handleForAddress,
  likeCountOf,
  saveProfileMeta,
  useFeedStore,
} from './post-store'
import { PostVisual, frameMark } from './post-visual'
import {
  acceptPrintOffer,
  cancelPrintOffer,
  getPrintForPost,
  highestOfferOf,
  usePrintMarketStore,
} from './print-market'

type ProfileTab = 'shot' | 'collected' | 'offers'

export function UserProfileView({ profileAddress }: { profileAddress: string }) {
  const t = useTranslations('feed.profile')
  const format = useFormatter()
  const stockName = useStockName()
  const { address: connectedAddress } = useWallet()
  const { posts } = useFeedStore()
  const { prints } = usePrintMarketStore()

  const norm = profileAddress.toLowerCase()
  const isMe = Boolean(connectedAddress && connectedAddress.toLowerCase() === norm)

  const profileMeta = getProfileMeta(profileAddress)
  const [tab, setTab] = useState<ProfileTab>('shot')
  const [editing, setEditing] = useState(false)
  const [handleInput, setHandleInput] = useState(profileMeta.handle ?? '')
  const [bioInput, setBioInput] = useState(profileMeta.bio)
  const [editError, setEditError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState(false)

  // 1. Frames shot by this photographer (excluding 1/1 Prints already sold to another collector)
  const userPosts = useMemo(
    () =>
      posts
        .filter((p) => {
          if (p.shooter.toLowerCase() !== norm) return false
          const pr = getPrintForPost(prints, p.id, p.photoHash)
          if (pr && pr.owner.toLowerCase() !== norm) return false
          return true
        })
        .sort((a, b) => b.createdAt - a.createdAt),
    [posts, prints, norm],
  )

  // 2. 1/1 Print NFTs currently owned by this address
  const collectedPrints = useMemo(
    () =>
      prints
        .filter((pr) => pr.owner.toLowerCase() === norm)
        .sort((a, b) => b.mintedAt - a.mintedAt),
    [prints, norm],
  )

  // 3. Active offers placed by this user + incoming offers on prints owned by this user
  const outgoingOffers = useMemo(
    () =>
      prints.flatMap((pr) =>
        pr.offers
          .filter((o) => o.bidder.toLowerCase() === norm)
          .map((offer) => ({ kind: 'outgoing' as const, print: pr, offer })),
      ),
    [prints, norm],
  )

  const incomingOffers = useMemo(
    () =>
      prints
        .filter((pr) => pr.owner.toLowerCase() === norm)
        .flatMap((pr) =>
          pr.offers.map((offer) => ({ kind: 'incoming' as const, print: pr, offer })),
        ),
    [prints, norm],
  )

  const allOffers = useMemo(
    () =>
      [...incomingOffers, ...outgoingOffers].sort(
        (a, b) => b.offer.createdAt - a.offer.createdAt,
      ),
    [incomingOffers, outgoingOffers],
  )

  const displayHandle =
    profileMeta.handle ?? userPosts[0]?.handle ?? handleForAddress(profileAddress)
  const totalLikes = useMemo(
    () => userPosts.reduce((sum, p) => sum + likeCountOf(p), 0),
    [userPosts],
  )
  const totalOfferKub = useMemo(
    () => outgoingOffers.reduce((sum, x) => sum + x.offer.amountKub, 0),
    [outgoingOffers],
  )

  const openEditor = () => {
    const fresh = getProfileMeta(profileAddress)
    setHandleInput(fresh.handle ?? '')
    setBioInput(fresh.bio)
    setEditError(null)
    setEditing(true)
  }

  const handleSaveProfile = () => {
    const res = saveProfileMeta({
      address: profileAddress,
      handle: handleInput,
      bio: bioInput,
    })
    if (!res.ok) {
      setEditError(t(`edit.errors.${res.reason}`))
      return
    }
    setEditing(false)
    setSavedNotice(true)
    window.setTimeout(() => setSavedNotice(false), 2500)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-20 md:px-8">
      <Link
        href="/feed"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" />
        {t('backToFeed')}
      </Link>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-2xs tracking-wide text-frame">▸ {t('eyebrow')}</span>
            {isMe && <Badge tone="frame">{t('you')}</Badge>}
            {collectedPrints.length > 0 && (
              <Badge tone="success" dot>
                {t('collectorBadge', { count: collectedPrints.length })}
              </Badge>
            )}
          </div>
          <h1 className="font-display text-3xl leading-none md:text-4xl">
            {displayHandle ? `@${displayHandle}` : truncateHash(profileAddress)}
          </h1>
          <TxHash hash={profileAddress} />
          {profileMeta.bio && (
            <p className="mt-1 max-w-xl text-sm text-fg-muted">{profileMeta.bio}</p>
          )}
        </div>

        {isMe && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={openEditor}>
              <Pencil />
              {t('edit.trigger')}
            </Button>
            <Button variant="primary" size="sm" asChild>
              <Link href="/darkroom">{t('openDarkroom')}</Link>
            </Button>
          </div>
        )}
      </header>

      {savedNotice && (
        <div
          role="status"
          className="mb-6 border border-success/40 bg-bg-raised px-4 py-2.5 text-xs text-success"
        >
          {t('edit.saved')}
        </div>
      )}

      {/* Inline Profile Editor for the connected owner */}
      {isMe && editing && (
        <section className="mb-8 flex flex-col gap-4 border border-border-strong bg-bg-raised p-4 md:p-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex flex-col gap-0.5">
              <RebateLabel>{t('edit.title')}</RebateLabel>
              <p className="text-xs text-fg-muted">{t('edit.subtitle')}</p>
            </div>
            <button
              type="button"
              onClick={() => setEditing(false)}
              aria-label={t('edit.cancel')}
              className="rounded-xs p-1 text-fg-muted hover:text-fg"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label={t('edit.handleLabel')}
              hint={t('edit.handleHint')}
              placeholder="ploy.shoots"
              leading="@"
              value={handleInput}
              error={editError ?? undefined}
              onChange={(e) => {
                setHandleInput(e.target.value)
                setEditError(null)
              }}
            />
            <Input
              label={t('edit.bioLabel')}
              placeholder={t('edit.bioPlaceholder')}
              maxLength={160}
              value={bioInput}
              onChange={(e) => setBioInput(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              {t('edit.cancel')}
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveProfile}>
              <Check />
              {t('edit.save')}
            </Button>
          </div>
        </section>
      )}

      <div className="mb-8">
        <KPIGrid>
          <KPIStat label={t('stats.frames')} value={format.number(userPosts.length)} />
          <KPIStat label={t('stats.collected')} value={format.number(collectedPrints.length)} />
          <KPIStat
            label={t('stats.activeOffers')}
            value={`${totalOfferKub.toFixed(1)} KUB`}
            hint={t('stats.offersCount', { count: allOffers.length })}
          />
          <KPIStat label={t('stats.likes')} value={format.number(totalLikes)} />
        </KPIGrid>
      </div>

      {/* Profile Tabs: Shot | Collected 1/1 Prints | Offers */}
      <div className="mb-8 flex flex-wrap gap-1.5" role="tablist" aria-label={t('tabsLabel')}>
        {(
          [
            ['shot', `${t('tabs.shot')} (${userPosts.length})`],
            ['collected', `${t('tabs.collected')} (${collectedPrints.length})`],
            ['offers', `${t('tabs.offers')} (${allOffers.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-xs border px-3 font-mono text-xs transition-colors duration-[var(--dur-fast)]',
              tab === key
                ? 'border-border-strong bg-bg-sunken text-fg'
                : 'border-border bg-bg-raised text-fg-muted hover:text-fg',
            )}
          >
            {key === 'collected' && <Sparkles className="size-3 text-frame" />}
            {key === 'offers' && <Gavel className="size-3 text-frame" />}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: Shot Frames */}
      {tab === 'shot' &&
        (userPosts.length === 0 ? (
          <EmptyState
            mark="00"
            title={t('emptyTitle')}
            description={isMe ? t('emptyBodySelf') : t('emptyBodyOther')}
            action={
              <Button variant="primary" size="sm" asChild>
                <Link href={isMe ? '/darkroom' : '/camera'}>
                  <Aperture />
                  {isMe ? t('openDarkroom') : t('shootCta')}
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {userPosts.map((post) => {
              const print = getPrintForPost(prints, post.id, post.photoHash)
              const topOffer = highestOfferOf(print)
              return (
                <li key={post.id}>
                  <article className="flex flex-col gap-2.5">
                    <Link href={`/p/${post.id}` as Route} className="group block">
                      <PostVisual
                        post={post}
                        imgClassName="transition-transform duration-[var(--dur-slow)] group-hover:scale-[1.015]"
                      />
                    </Link>
                    <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                      <RebateLabel>
                        {frameMark(post.frame)} · {stockName(post.filmId)}
                      </RebateLabel>
                      <div className="flex items-center gap-2">
                        {print && (
                          <Badge tone="frame">
                            1/1 #{String(print.tokenId).padStart(2, '0')}
                            {print.askPriceKub
                              ? ` · ${print.askPriceKub.toFixed(1)} KUB`
                              : topOffer
                                ? ` · ${topOffer.amountKub.toFixed(1)} KUB`
                                : ''}
                          </Badge>
                        )}
                        <span className="inline-flex items-center gap-1 font-mono text-xs tabular text-fg-muted">
                          <Heart className="size-3.5 text-accent" />
                          {format.number(likeCountOf(post))}
                        </span>
                      </div>
                    </div>
                    {post.caption && (
                      <p className="line-clamp-2 px-0.5 text-sm text-fg">{post.caption}</p>
                    )}
                  </article>
                </li>
              )
            })}
          </ul>
        ))}

      {/* TAB 2: Collected 1/1 Prints */}
      {tab === 'collected' &&
        (collectedPrints.length === 0 ? (
          <EmptyState
            mark="01"
            title={t('collectedEmpty.title')}
            description={t('collectedEmpty.body')}
            action={
              <Button variant="primary" size="sm" asChild>
                <Link href="/feed">
                  <Sparkles />
                  {t('collectedEmpty.cta')}
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {collectedPrints.map((pr) => {
              const post = posts.find(
                (p) =>
                  p.id === pr.postId ||
                  p.photoHash.toLowerCase() === pr.photoHash.toLowerCase(),
              )
              const topOffer = highestOfferOf(pr)
              const shooterHandle = handleForAddress(pr.photographer)
              const isSelfShot = pr.photographer.toLowerCase() === norm

              return (
                <li key={pr.tokenId}>
                  <article className="flex flex-col gap-3 border border-frame/40 bg-bg-raised p-3">
                    {post && (
                      <Link href={`/p/${post.id}` as Route} className="group block">
                        <PostVisual
                          post={post}
                          imgClassName="transition-transform duration-[var(--dur-slow)] group-hover:scale-[1.015]"
                        />
                      </Link>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <RebateLabel>
                          1/1 PRINT #{String(pr.tokenId).padStart(2, '0')}
                        </RebateLabel>
                        <Badge tone={pr.askPriceKub ? 'frame' : 'info'} dot>
                          {pr.askPriceKub
                            ? `${pr.askPriceKub.toFixed(2)} KUB`
                            : t('openForOffers')}
                        </Badge>
                      </div>

                      <p className="text-xs text-fg-muted">
                        {isSelfShot
                          ? t('selfMintedPrint')
                          : t('shotByPhotographer', {
                              photographer: shooterHandle
                                ? `@${shooterHandle}`
                                : truncateHash(pr.photographer),
                            })}
                        {pr.lastSaleKub ? ` · ${pr.lastSaleKub.toFixed(2)} KUB` : ''}
                      </p>

                      <div className="mt-1 flex items-center justify-between border-t border-border pt-2 font-mono text-2xs">
                        <span className="text-frame">
                          {topOffer
                            ? t('topOfferLabel', { amount: topOffer.amountKub.toFixed(2) })
                            : t('noOffersLabel')}
                        </span>
                        <Link
                          href={`/p/${pr.postId}` as Route}
                          className="inline-flex items-center gap-1 text-fg underline hover:text-frame"
                        >
                          {t('managePrintLink')}
                          <ExternalLink className="size-3" />
                        </Link>
                      </div>
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
        ))}

      {/* TAB 3: Active Offers (Incoming & Outgoing) */}
      {tab === 'offers' &&
        (allOffers.length === 0 ? (
          <EmptyState
            mark="02"
            title={t('offersEmpty.title')}
            description={t('offersEmpty.body')}
            action={
              <Button variant="primary" size="sm" asChild>
                <Link href="/feed">
                  <Gavel />
                  {t('collectedEmpty.cta')}
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border border border-border bg-bg-raised">
            {allOffers.map(({ kind, print, offer }) => (
              <li
                key={offer.id}
                className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={kind === 'incoming' ? 'success' : 'frame'} dot>
                      {t(`offerDirection.${kind}`)}
                    </Badge>
                    <RebateLabel>
                      1/1 PRINT #{String(print.tokenId).padStart(2, '0')} ·{' '}
                      {frameMark(print.frame)} · {stockName(print.filmId)}
                    </RebateLabel>
                    <Link
                      href={`/p/${print.postId}` as Route}
                      className="inline-flex items-center gap-1 font-mono text-xs text-fg underline hover:text-frame"
                    >
                      {print.postId}
                      <ExternalLink className="size-3" />
                    </Link>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-fg-muted">
                    <span className="font-semibold text-frame">
                      {offer.amountKub.toFixed(2)} KUB
                    </span>
                    <span>
                      {t('fromBidder')}:{' '}
                      <Link
                        href={`/u/${offer.bidder}` as Route}
                        className="text-fg hover:underline"
                      >
                        {offer.bidderHandle
                          ? `@${offer.bidderHandle}`
                          : truncateHash(offer.bidder)}
                      </Link>
                    </span>
                    <span className="text-2xs text-fg-subtle">
                      {format.relativeTime(new Date(offer.createdAt), new Date())}
                    </span>
                  </div>
                </div>

                {isMe && connectedAddress && (
                  <div className="flex items-center gap-2">
                    {kind === 'incoming' ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() =>
                          acceptPrintOffer({
                            tokenId: print.tokenId,
                            offerId: offer.id,
                            seller: connectedAddress,
                          })
                        }
                      >
                        <Check />
                        {t('acceptOfferBtn')}
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          cancelPrintOffer({
                            tokenId: print.tokenId,
                            offerId: offer.id,
                            bidder: connectedAddress,
                          })
                        }
                      >
                        {t('cancelOfferBtn')}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
