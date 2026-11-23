'use client'

import { activeChain } from '@/features/wallet'
import { Badge, Button, FilmStrip, RebateLabel, TxHash, cn } from '@chainroll/ui'
import { Check, Cpu, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

export type MarketTxStage = 'awaiting-confirm' | 'mining' | 'confirmed'

export type MarketBlockTask = {
  badge: string
  headline: string
  contractFn: string
  digest: `0x${string}`
  valueKub?: number
  stage: MarketTxStage
  txHash?: `0x${string}`
  blockNumber?: bigint | null
}

export function MarketBlockHud({
  task,
  onConfirm,
  onDismiss,
}: {
  task: MarketBlockTask
  onConfirm: () => void
  onDismiss: () => void
}) {
  const t = useTranslations('feed.market.blockHud')
  const { stage } = task
  const txBase = activeChain.blockExplorers?.default.url
    ? `${activeChain.blockExplorers.default.url}/tx/`
    : undefined

  return (
    <>
      <div
        aria-hidden
        onClick={stage === 'awaiting-confirm' ? onDismiss : undefined}
        className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        className="fixed inset-x-3 top-1/2 z-50 mx-auto max-w-md -translate-y-1/2"
      >
        <div
          className={cn(
            'flex flex-col gap-3.5 rounded-sm border bg-[#120f0d]/95 p-4 text-[#f2ede4] shadow-[var(--elev-pop)] backdrop-blur-md',
            stage === 'confirmed'
              ? 'border-success/60 shadow-[inset_2px_0_0_var(--success)]'
              : 'border-frame/60 shadow-[inset_2px_0_0_var(--frame)]',
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <RebateLabel>{task.badge}</RebateLabel>
                <Badge tone={stage === 'confirmed' ? 'success' : 'frame'} dot>
                  {t(`stages.${stage}`)}
                </Badge>
              </div>
              <p className="text-sm font-semibold text-[#f2ede4]">{task.headline}</p>
            </div>
            {stage !== 'mining' && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label={t('dismiss')}
                className="rounded-xs p-1 text-[#a39a90] hover:text-[#f2ede4]"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* 3-Step Block Progress */}
          <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
            <div
              className={cn(
                'flex items-center gap-1 border px-2 py-1',
                stage === 'awaiting-confirm'
                  ? 'border-frame bg-frame/15 text-frame'
                  : 'border-white/15 bg-black/40 text-success',
              )}
            >
              <ShieldCheck className="size-3 shrink-0" />
              <span className="truncate">1. {t('step1')}</span>
            </div>
            <div
              className={cn(
                'flex items-center gap-1 border px-2 py-1',
                stage === 'mining'
                  ? 'border-frame bg-frame/15 text-frame'
                  : stage === 'confirmed'
                    ? 'border-white/15 bg-black/40 text-success'
                    : 'border-white/10 bg-black/20 text-[#7d756c]',
              )}
            >
              <Cpu className="size-3 shrink-0" />
              <span className="truncate">2. {t('step2')}</span>
            </div>
            <div
              className={cn(
                'flex items-center gap-1 border px-2 py-1',
                stage === 'confirmed'
                  ? 'border-success/50 bg-success/15 text-success'
                  : 'border-white/10 bg-black/20 text-[#7d756c]',
              )}
            >
              <Sparkles className="size-3 shrink-0" />
              <span className="truncate">3. {t('step3')}</span>
            </div>
          </div>

          {/* Ledger Details */}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border border-white/10 bg-black/50 p-2.5 font-mono text-2xs">
            <div className="col-span-2 border-b border-white/10 pb-1.5">
              <dt className="text-[#7d756c]">{t('contractLabel')}</dt>
              <dd className="truncate text-frame">{task.contractFn}</dd>
            </div>
            {task.valueKub !== undefined && task.valueKub > 0 && (
              <div className="col-span-2 flex items-center justify-between border-b border-white/10 pb-1.5">
                <dt className="text-[#7d756c]">{t('valueLabel')}</dt>
                <dd className="font-semibold text-[#f2ede4] tabular">
                  {task.valueKub.toFixed(2)} KUB
                </dd>
              </div>
            )}
            <div>
              <dt className="text-[#7d756c]">{t('digestLabel')}</dt>
              <dd className="text-[#f2ede4]">
                <TxHash hash={task.digest} />
              </dd>
            </div>
            <div>
              <dt className="text-[#7d756c]">{t('networkLabel')}</dt>
              <dd className="text-frame">{activeChain.name} · ~85k gas</dd>
            </div>
            {task.txHash && (
              <div className="col-span-2 flex items-center justify-between border-t border-white/10 pt-1.5">
                <dt className="text-[#7d756c]">
                  {t('txHashLabel')}
                  {task.blockNumber ? ` · #${task.blockNumber.toLocaleString()}` : ''}
                </dt>
                <dd>
                  <TxHash hash={task.txHash} explorerUrl={txBase} />
                </dd>
              </div>
            )}
          </dl>

          {/* Controls */}
          {stage === 'awaiting-confirm' && (
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                {t('cancelBtn')}
              </Button>
              <Button variant="primary" size="sm" onClick={onConfirm}>
                <Check />
                {t('confirmBtn')}
              </Button>
            </div>
          )}

          {stage === 'mining' && (
            <div className="flex items-center justify-between gap-3">
              <FilmStrip className="w-28" label={t('stages.mining')} />
              <span className="font-mono text-2xs text-[#a39a90]">{t('waitingBlockHint')}</span>
            </div>
          )}

          {stage === 'confirmed' && (
            <p className="font-mono text-xs text-success">{t('confirmedHint')}</p>
          )}
        </div>
      </div>
    </>
  )
}
