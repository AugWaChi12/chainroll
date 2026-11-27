'use client'

import { getStock, useStockName } from '@/features/film'
import {
  countdown,
  fetchCloudFramesForRoll,
  photoStore,
  rollStage,
  syncAllLocalRollsToCloud,
  useMyRolls,
  useNowSec,
  type ChainRoll,
} from '@/features/roll'
import { ConnectSheet, activeChain, useWallet } from '@/features/wallet'
import { Badge, Button, EmptyState, ErrorState, LatentFrame, Skeleton, cn } from '@chainroll/ui'
import { Aperture, Check, ChevronRight, Cloud, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const STAGE_TONE = {
  shooting: 'frame',
  full: 'warning',
  developing: 'danger',
  developed: 'success',
} as const

export function DarkroomList() {
  const t = useTranslations('darkroom')
  const w = useWallet()
  const { rolls, loading, error, refetch } = useMyRolls(w.address)
  const now = useNowSec()
  const [connectOpen, setConnectOpen] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null)
  const [syncFinishedCount, setSyncFinishedCount] = useState<number>(0)

  // Automatically sweep & upload any unsynced local IndexedDB shots on this device to Private R2 (zero SIWE)
  // including when the mobile browser reconnects to the network (even if wallet is not connected yet).
  useEffect(() => {
    let alive = true
    const runSweep = () => {
      void syncAllLocalRollsToCloud(activeChain.id, (done, total) => {
        if (alive) setSyncProgress({ done, total })
      }).then(({ uploaded }) => {
        if (!alive) return
        setSyncProgress(null)
        if (uploaded > 0) setSyncFinishedCount((prev) => prev + uploaded)
      })
    }
    runSweep()
    window.addEventListener('online', runSweep)
    return () => {
      alive = false
      window.removeEventListener('online', runSweep)
    }
  }, [w.address])

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-16 md:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-2xs tracking-wide text-frame">▸ {t('eyebrow')}</span>
          <h1 className="font-display text-3xl leading-none md:text-4xl">{t('title')}</h1>
          <p className="max-w-xl text-sm text-fg-muted">{t('subtitle')}</p>
        </div>
        {w.address && (
          <Button variant="primary" asChild>
            <Link href="/camera">
              <Aperture />
              {t('toCamera')}
            </Link>
          </Button>
        )}
      </header>

      {syncProgress && (
        <div className="mb-5 flex items-center gap-2 border border-frame/40 bg-bg-raised px-3.5 py-2 font-mono text-2xs text-frame">
          <Loader2 className="size-3.5 animate-spin" />
          <span>
            {t('syncingCloud')} ({syncProgress.done}/{syncProgress.total})
          </span>
        </div>
      )}
      {!syncProgress && syncFinishedCount > 0 && (
        <div className="mb-5 flex items-center gap-2 border border-success/40 bg-success/10 px-3.5 py-2 font-mono text-2xs text-success">
          <Check className="size-3.5" />
          <Cloud className="size-3.5" />
          <span>{t('cloudSynced', { count: syncFinishedCount })}</span>
        </div>
      )}

      {!w.address ? (
        <EmptyState
          mark="00"
          title={t('connect.title')}
          description={t('connect.body')}
          action={
            <Button variant="primary" onClick={() => setConnectOpen(true)}>
              {t('connect.cta')}
            </Button>
          }
        />
      ) : error ? (
        <ErrorState
          title={t('error')}
          description={String(error.message).slice(0, 140)}
          onRetry={() => void refetch()}
        />
      ) : loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : rolls.length === 0 ? (
        <EmptyState
          mark="00"
          title={t('empty.title')}
          description={t('empty.body')}
          action={
            <Button variant="primary" asChild>
              <Link href="/camera">{t('empty.cta')}</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {rolls.map((r) => (
            <li key={String(r.id)}>
              <RollCard roll={r} now={now} />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-10 text-2xs text-fg-subtle">{t('localNote')}</p>
      <ConnectSheet open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  )
}

function RollCard({ roll, now }: { roll: ChainRoll; now: number }) {
  const t = useTranslations('darkroom')
  const stockName = useStockName()
  const stock = getStock(roll.filmId)
  const stage = rollStage(roll, now)
  const thumbs = useRollThumbs(roll.id, stage === 'developed')

  return (
    <Link
      href={`/darkroom/${roll.id}`}
      className="group flex flex-col gap-3 border border-border bg-bg-raised p-4 transition-colors hover:border-fg-muted"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="size-4 rounded-full" style={{ background: stock.swatch }} />
          <span className="font-medium">{stockName(stock.id)}</span>
          <span className="font-mono text-2xs text-fg-subtle">#{String(roll.id)}</span>
        </div>
        <Badge tone={STAGE_TONE[stage]} dot>
          {t(`stage.${stage}`)}
        </Badge>
      </div>

      {/* six frames of the strip */}
      <div className="flex gap-1 bg-[#0e0c0b] p-1.5">
        {Array.from({ length: 6 }, (_, i) => {
          const url = thumbs[i]
          return (
            <div key={i} className="aspect-[2/3] flex-1 overflow-hidden">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element -- blob: URL
                <img src={url} alt="" className="size-full object-cover" />
              ) : (
                <LatentFrame
                  frame={i + 1}
                  className={cn('size-full', i >= roll.framesUsed && 'opacity-30')}
                />
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between font-mono text-2xs text-fg-muted">
        <span className="tabular">
          {String(roll.framesUsed).padStart(2, '0')} / {roll.frames} · {stock.code}
        </span>
        <span className="flex items-center gap-1 text-fg">
          {stage === 'developing' ? (
            <span className="tabular text-danger">{countdown(roll.developReadyAt, now)}</span>
          ) : (
            t(`cardAction.${stage}`)
          )}
          <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  )
}

/** First six developed thumbnails from this device or R2 Cloud (empty while latent). */
function useRollThumbs(rollId: bigint, developed: boolean) {
  const [urls, setUrls] = useState<(string | undefined)[]>([])
  useEffect(() => {
    if (!developed) return
    let alive = true
    const made: string[] = []
    const load = async () => {
      const rows = await photoStore.listRoll(`${activeChain.id}:${rollId}`)
      if (!alive) return
      const byFrame: (string | undefined)[] = []
      for (const r of rows) {
        if (r.frame >= 1 && r.frame <= 6) {
          const u = URL.createObjectURL(r.blob)
          made.push(u)
          byFrame[r.frame - 1] = u
        }
      }
      if (byFrame.filter(Boolean).length > 0) {
        setUrls([...byFrame])
      }
      // Fill any missing thumbnail slots from R2 Cloud Sync automatically
      if (byFrame.filter(Boolean).length < 6) {
        const cloud = await fetchCloudFramesForRoll(rollId)
        if (!alive) return
        for (const f of cloud.frames) {
          if (f.frame >= 1 && f.frame <= 6 && !byFrame[f.frame - 1]) {
            byFrame[f.frame - 1] = f.url
          }
        }
        setUrls([...byFrame])
      }
    }
    void load()
    return () => {
      alive = false
      made.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [rollId, developed])
  return developed ? urls : []
}
