'use client'

import { useStockName } from '@/features/film'
import { useWallet } from '@/features/wallet'
import { Badge, Button, EmptyState, RebateLabel, Skeleton, cn, truncateHash } from '@chainroll/ui'
import { Aperture, Crown, Film, Flame, Heart, Sparkles, Trophy } from 'lucide-react'
import type { Route } from 'next'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type LeaderboardEntry = {
  address: string
  handle: string | null
  rollsCount: number
  framesShot: number
  postsCount: number
  totalLikes: number
  printsOwned: number
  printsMinted: number
  favoriteFilmId: number
  signatureImageUrl: string | null
  signaturePostId: string | null
  signatureScene: 'nature' | 'portrait' | 'night' | 'indoor'
}

type LeaderboardResponse = {
  ok: boolean
  totals?: {
    photographers: number
    frames: number
    posts: number
    prints: number
    likes: number
  }
  entries?: LeaderboardEntry[]
}

type BoardTab = 'shooters' | 'loved' | 'collectors'

const MEDAL_STYLE = [
  {
    code: '01A · GOLD',
    ring: 'border-frame/80 shadow-[0_0_28px_rgba(232,163,61,0.16)]',
    badge: 'bg-frame text-[#0b0908]',
    order: 'md:order-2 md:-mt-4',
  },
  {
    code: '02A · SILVER',
    ring: 'border-border-strong',
    badge: 'bg-fg/90 text-[#0b0908]',
    order: 'md:order-1 md:mt-4',
  },
  {
    code: '03A · BRONZE',
    ring: 'border-[#b97a4b]/60',
    badge: 'bg-[#b97a4b] text-[#0b0908]',
    order: 'md:order-3 md:mt-6',
  },
] as const

function Sprockets() {
  return (
    <div
      aria-hidden
      className="h-2.5 w-full"
      style={{
        backgroundImage:
          'repeating-linear-gradient(90deg, transparent 0 8px, rgba(242,237,228,.16) 8px 16px, transparent 16px 24px)',
        backgroundSize: '24px 6px',
        backgroundRepeat: 'repeat-x',
        backgroundPosition: '0 center',
      }}
    />
  )
}

function slideImageOf(entry: LeaderboardEntry): string {
  return entry.signatureImageUrl || `/samples/${entry.signatureScene}.jpg`
}

export function LeaderboardView() {
  const t = useTranslations('leaderboard')
  const format = useFormatter()
  const stockName = useStockName()
  const { address } = useWallet()

  const [tab, setTab] = useState<BoardTab>('shooters')
  const [data, setData] = useState<LeaderboardResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    void window
      .fetch('/api/leaderboard', { cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<LeaderboardResponse>) : null))
      .then((json) => {
        if (!alive) return
        if (json?.ok) setData(json)
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const ranked = useMemo(() => {
    const entries = data?.entries ?? []
    const filtered =
      tab === 'collectors'
        ? entries.filter((e) => e.printsOwned > 0 || e.printsMinted > 0)
        : entries
    return [...filtered].sort((a, b) => {
      if (tab === 'loved') {
        return b.totalLikes - a.totalLikes || b.postsCount - a.postsCount || b.framesShot - a.framesShot
      }
      if (tab === 'collectors') {
        return b.printsOwned - a.printsOwned || b.printsMinted - a.printsMinted || b.totalLikes - a.totalLikes
      }
      return b.framesShot - a.framesShot || b.postsCount - a.postsCount || b.totalLikes - a.totalLikes
    })
  }, [data, tab])

  const podium = ranked.slice(0, 3)
  const rest = ranked.slice(3)
  const totals = data?.totals

  const myRank = useMemo(() => {
    if (!address) return null
    const idx = ranked.findIndex((e) => e.address.toLowerCase() === address.toLowerCase())
    return idx >= 0 ? idx + 1 : null
  }, [address, ranked])

  const primaryStat = (entry: LeaderboardEntry) => {
    if (tab === 'loved') {
      return { value: format.number(entry.totalLikes), unit: t('units.likes') }
    }
    if (tab === 'collectors') {
      return { value: format.number(entry.printsOwned), unit: t('units.prints') }
    }
    return { value: format.number(entry.framesShot), unit: t('units.frames') }
  }

  return (
    <div className="mx-auto max-w-6xl px-3.5 pt-6 pb-20 sm:px-4 sm:pt-10 md:px-8">
      {/* Editorial header */}
      <header className="mb-6 flex flex-col gap-3 border-b border-border pb-5 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-2xs tracking-wide text-frame">▸ {t('eyebrow')}</span>
          <h1 className="font-display text-3xl leading-none md:text-4xl">{t('title')}</h1>
          <p className="max-w-xl text-sm text-fg-muted">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {myRank !== null && (
            <Badge tone="frame" dot>
              {t('yourRank', { rank: String(myRank).padStart(2, '0') })}
            </Badge>
          )}
          <Button variant="primary" size="sm" asChild>
            <Link href="/camera">
              <Aperture />
              {t('cta')}
            </Link>
          </Button>
        </div>
      </header>

      {/* Global Darkroom Pulse Strip */}
      {totals && (
        <div className="mb-6 grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
          {[
            { label: t('pulse.photographers'), value: format.number(totals.photographers) },
            { label: t('pulse.frames'), value: format.number(totals.frames) },
            { label: t('pulse.prints'), value: format.number(totals.prints) },
            { label: t('pulse.likes'), value: format.number(totals.likes) },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col gap-0.5 bg-bg-raised px-4 py-3">
              <span className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
                {stat.label}
              </span>
              <span className="font-display text-2xl leading-tight tabular text-fg">
                {stat.value}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Category Tabs */}
      <div
        className="-mx-3.5 mb-7 flex flex-nowrap gap-1.5 overflow-x-auto px-3.5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label={t('tabsLabel')}
      >
        {(
          [
            { key: 'shooters', icon: Flame },
            { key: 'loved', icon: Heart },
            { key: 'collectors', icon: Sparkles },
          ] as const
        ).map(({ key, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-2 rounded-xs border px-3.5 font-mono text-xs whitespace-nowrap transition-colors duration-[var(--dur-fast)]',
              tab === key
                ? 'border-frame bg-bg-sunken text-frame'
                : 'border-border bg-bg-raised text-fg-muted hover:border-border-strong hover:text-fg',
            )}
          >
            <Icon className="size-3.5" />
            <span>{t(`tabs.${key}`)}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : ranked.length === 0 ? (
        <EmptyState
          mark="00"
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={
            <Button variant="primary" size="sm" asChild>
              <Link href="/camera">{t('cta')}</Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {/* TOP 3: 35mm Darkroom Film-Strip Podium */}
          <section
            aria-label={t('podiumLabel')}
            className="grain overflow-hidden border border-border-strong bg-[#0b0908] p-3 sm:p-5"
          >
            <Sprockets />
            <div className="my-4 grid gap-4 md:grid-cols-3 md:items-end">
              {podium.map((entry, idx) => {
                const medal = MEDAL_STYLE[idx] ?? MEDAL_STYLE[2]
                const stat = primaryStat(entry)
                const isMe = Boolean(
                  address && address.toLowerCase() === entry.address.toLowerCase(),
                )
                return (
                  <article
                    key={entry.address}
                    className={cn(
                      'group relative flex flex-col overflow-hidden border bg-bg-raised transition-transform duration-[var(--dur-fast)] hover:-translate-y-0.5',
                      medal.ring,
                      medal.order,
                    )}
                  >
                    {/* Film Slide Image */}
                    <Link
                      href={`/u/${entry.address}` as Route}
                      className="relative block aspect-[4/3] overflow-hidden bg-black"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- external R2 / sample */}
                      <img
                        src={slideImageOf(entry)}
                        alt=""
                        className="size-full object-cover transition-transform duration-[var(--dur-slow)] group-hover:scale-[1.03]"
                      />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

                      {/* Rank rebate chip */}
                      <span
                        className={cn(
                          'absolute top-2.5 left-2.5 inline-flex items-center gap-1 px-2 py-0.5 font-mono text-[10px] font-bold tracking-[0.14em]',
                          medal.badge,
                        )}
                      >
                        {idx === 0 ? <Crown className="size-3" /> : <Trophy className="size-3" />}
                        ▸ {medal.code}
                      </span>

                      {isMe && (
                        <span className="absolute top-2.5 right-2.5 bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-accent-fg">
                          {t('you')}
                        </span>
                      )}

                      {/* Bottom overlay hero metric */}
                      <div className="absolute inset-x-3 bottom-2.5 flex items-end justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-display text-lg leading-tight text-white">
                            {entry.handle ? `@${entry.handle}` : truncateHash(entry.address)}
                          </p>
                          <p className="font-mono text-[10px] text-white/70">
                            {truncateHash(entry.address)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="block font-display text-2xl leading-none tabular text-frame">
                            {stat.value}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-wider text-white/75">
                            {stat.unit}
                          </span>
                        </div>
                      </div>
                    </Link>

                    {/* Rebate footer stats */}
                    <div className="flex items-center justify-between gap-2 border-t border-border bg-bg-raised px-3 py-2.5">
                      <RebateLabel>{stockName(entry.favoriteFilmId)}</RebateLabel>
                      <div className="flex items-center gap-3 font-mono text-2xs tabular text-fg-muted">
                        <span className="inline-flex items-center gap-1">
                          <Film className="size-3 text-fg-subtle" />
                          {entry.framesShot}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Heart className="size-3 text-fg-subtle" />
                          {entry.totalLikes}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Sparkles className="size-3 text-frame" />
                          {entry.printsOwned}
                        </span>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
            <Sprockets />
            <div className="mt-2 flex items-center justify-between font-mono text-[10px] tracking-[0.22em] text-frame/60">
              <span>▸ CHAINROLL · KUB CHAIN</span>
              <span>HALL OF FRAMES · 35MM</span>
            </div>
          </section>

          {/* RANK #4+: Contact-Sheet Ledger */}
          {rest.length > 0 && (
            <section className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
                  ▸ {t('ledgerTitle')}
                </span>
                <span className="font-mono text-2xs tabular text-fg-subtle">
                  {t('totalEntries', { count: ranked.length })}
                </span>
              </div>
              <ol className="divide-y divide-border border border-border bg-bg-raised">
                {rest.map((entry, i) => {
                  const rankNum = i + 4
                  const stat = primaryStat(entry)
                  const isMe = Boolean(
                    address && address.toLowerCase() === entry.address.toLowerCase(),
                  )
                  return (
                    <li key={entry.address}>
                      <Link
                        href={`/u/${entry.address}` as Route}
                        className={cn(
                          'flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-bg-sunken sm:gap-4 sm:px-4',
                          isMe && 'bg-frame/5',
                        )}
                      >
                        <span className="w-7 shrink-0 font-mono text-sm font-medium tabular text-frame">
                          {String(rankNum).padStart(2, '0')}
                        </span>
                        <div className="size-11 shrink-0 overflow-hidden border border-border bg-black">
                          {/* eslint-disable-next-line @next/next/no-img-element -- external R2 / sample */}
                          <img
                            src={slideImageOf(entry)}
                            alt=""
                            className="size-full object-cover"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-fg">
                              {entry.handle ? `@${entry.handle}` : truncateHash(entry.address)}
                            </span>
                            {isMe && <Badge tone="frame">{t('you')}</Badge>}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-2xs text-fg-subtle">
                            <span>{truncateHash(entry.address)}</span>
                            <span>·</span>
                            <span>{stockName(entry.favoriteFilmId)}</span>
                          </div>
                        </div>
                        <div className="hidden items-center gap-4 font-mono text-xs tabular text-fg-muted sm:flex">
                          <span>
                            {entry.framesShot} {t('units.frames')}
                          </span>
                          <span>
                            {entry.totalLikes} {t('units.likes')}
                          </span>
                          <span>
                            {entry.printsOwned} {t('units.prints')}
                          </span>
                        </div>
                        <div className="shrink-0 text-right sm:hidden">
                          <span className="block font-mono text-sm font-semibold tabular text-frame">
                            {stat.value}
                          </span>
                          <span className="font-mono text-[10px] text-fg-subtle">{stat.unit}</span>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ol>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
