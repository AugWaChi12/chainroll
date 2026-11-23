'use client'

import { activeChain } from '@/features/wallet'
import type { TxErrorCode } from '@/features/wallet'
import { Badge, Button, FilmStrip, RebateLabel, TxHash, cn } from '@chainroll/ui'
import { Check, Cpu, ExternalLink, RefreshCcw, ShieldCheck, Sparkles, Wallet, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

export type ShotTxStage = 'awaiting-confirm' | 'signing' | 'mining' | 'confirmed' | 'failed'

export type BlockHudTask =
  | {
      kind: 'claim'
      filmId: number
      stockCode: string
      digest: `0x${string}`
      stage: ShotTxStage
      txHash?: `0x${string}`
      blockNumber?: bigint | null
      errorCode?: TxErrorCode
    }
  | {
      kind: 'shoot'
      frame: number
      stockCode: string
      digest: `0x${string}`
      stage: ShotTxStage
      txHash?: `0x${string}`
      blockNumber?: bigint | null
      errorCode?: TxErrorCode
    }
  | {
      kind: 'develop'
      rollId: bigint
      early?: boolean
      stockCode: string
      digest: `0x${string}`
      stage: ShotTxStage
      txHash?: `0x${string}`
      blockNumber?: bigint | null
      errorCode?: TxErrorCode
    }

export function BlockConfirmHud({
  task,
  approvalUrl,
  autoConfirm,
  onToggleAutoConfirm,
  onConfirm,
  onSignWallet,
  onRetry,
  onDismiss,
}: {
  task: BlockHudTask
  approvalUrl?: string | null
  autoConfirm?: boolean
  onToggleAutoConfirm?: (next: boolean) => void
  onConfirm: () => void
  onSignWallet?: () => void
  onRetry: () => void
  onDismiss: () => void
}) {
  const t = useTranslations('camera.blockHud')
  const { stage } = task
  const txBase = activeChain.blockExplorers?.default.url
    ? `${activeChain.blockExplorers.default.url}/tx/`
    : undefined

  const frameStr =
    task.kind === 'shoot'
      ? `${String(task.frame).padStart(2, '0')}${task.frame % 2 ? 'A' : ''}`
      : '00'

  const rebateText =
    task.kind === 'claim'
      ? `CLAIM · ${task.stockCode}`
      : task.kind === 'develop'
        ? `DEVELOP · #${String(task.rollId)}`
        : `${frameStr} · ${task.stockCode}`

  const contractFnText =
    task.kind === 'claim'
      ? `ChainRoll.claimDailyRoll(${task.filmId})`
      : task.kind === 'develop'
        ? task.early
          ? `ChainRoll.developEarly(${String(task.rollId)})`
          : `ChainRoll.develop(${String(task.rollId)})`
        : `ChainRoll.shoot(#${frameStr})`

  const headline =
    task.kind === 'claim'
      ? t(`claimHeadlines.${stage}`, { stock: task.stockCode })
      : task.kind === 'develop'
        ? t(`developHeadlines.${stage}`, { rollId: String(task.rollId) })
        : t(`headlines.${stage}`, { frame: frameStr })

  return (
    <>
      {stage === 'awaiting-confirm' && (
        <div
          aria-hidden
          onClick={onDismiss}
          className="fixed inset-0 z-40 bg-black/65 backdrop-blur-[2px]"
        />
      )}
      <div
        role="dialog"
        aria-modal={stage === 'awaiting-confirm'}
        aria-label={t('title')}
        className={cn(
          'fixed inset-x-3 z-50 mx-auto max-w-md transition-all duration-[var(--dur-base)]',
          stage === 'awaiting-confirm'
            ? 'top-1/2 -translate-y-1/2'
            : 'bottom-36',
        )}
      >
        <div
          className={cn(
            'flex max-h-[82dvh] flex-col gap-3 overflow-y-auto rounded-sm border bg-[#120f0d]/95 p-3.5 text-[#f2ede4] shadow-[var(--elev-pop)] backdrop-blur-md sm:gap-3.5 sm:p-4',
            stage === 'confirmed'
              ? 'border-success/60 shadow-[inset_2px_0_0_var(--success)]'
              : stage === 'failed'
                ? 'border-danger/60 shadow-[inset_2px_0_0_var(--danger)]'
                : 'border-frame/60 shadow-[inset_2px_0_0_var(--frame)]',
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <RebateLabel>{rebateText}</RebateLabel>
                <Badge
                  tone={
                    stage === 'confirmed'
                      ? 'success'
                      : stage === 'failed'
                        ? 'danger'
                        : 'frame'
                  }
                  dot
                >
                  {t(`stages.${stage}`)}
                </Badge>
              </div>
              <p className="text-sm font-semibold text-[#f2ede4]">{headline}</p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label={t('dismiss')}
              className="rounded-xs p-1 text-[#a39a90] hover:text-[#f2ede4]"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 3-Step Visual Block Progress Bar */}
          <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px]">
            <div
              className={cn(
                'flex items-center gap-1 border px-2 py-1',
                stage === 'awaiting-confirm' || stage === 'signing'
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
                  : stage === 'failed'
                    ? 'border-danger/50 bg-danger/15 text-danger'
                    : 'border-white/10 bg-black/20 text-[#7d756c]',
              )}
            >
              <Sparkles className="size-3 shrink-0" />
              <span className="truncate">3. {t('step3')}</span>
            </div>
          </div>

          {/* On-chain Hash & Gas Ledger */}
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border border-white/10 bg-black/50 p-2.5 font-mono text-2xs">
            <div className="col-span-2 border-b border-white/10 pb-1.5">
              <dt className="text-[#7d756c]">{t('actionLabel')}</dt>
              <dd className="text-frame">{contractFnText}</dd>
            </div>
            <div>
              <dt className="text-[#7d756c]">{t('photoHash')}</dt>
              <dd className="text-[#f2ede4]">
                <TxHash hash={task.digest} />
              </dd>
            </div>
            <div>
              <dt className="text-[#7d756c]">{t('networkGas')}</dt>
              <dd className="text-frame">{activeChain.name} · ~55k gas</dd>
            </div>
            {task.txHash && (
              <div className="col-span-2 flex items-center justify-between border-t border-white/10 pt-1.5">
                <dt className="text-[#7d756c]">
                  {t('txHash')}
                  {task.blockNumber ? ` · #${task.blockNumber.toLocaleString()}` : ''}
                </dt>
                <dd>
                  <TxHash hash={task.txHash} explorerUrl={txBase} />
                </dd>
              </div>
            )}
          </dl>

          {/* Stage-specific interactive controls */}
          {stage === 'awaiting-confirm' && (
            <div className="flex flex-col gap-2.5">
              {task.kind === 'shoot' && onToggleAutoConfirm && (
                <label className="flex cursor-pointer items-center justify-between text-xs text-[#a39a90]">
                  <span>{t('autoConfirmLabel')}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(autoConfirm)}
                    onChange={(e) => onToggleAutoConfirm(e.target.checked)}
                    className="size-4 accent-[var(--accent)]"
                  />
                </label>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {onSignWallet ? (
                  <button
                    type="button"
                    onClick={onSignWallet}
                    className="inline-flex items-center gap-1 font-mono text-2xs text-[#a39a90] underline-offset-2 hover:text-[#f2ede4] hover:underline"
                  >
                    <Wallet className="size-3" />
                    {t('walletSignBtn')}
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={onDismiss}>
                    {t('later')}
                  </Button>
                  <Button variant="primary" size="sm" onClick={onConfirm}>
                    <Check />
                    {t('confirmBtn')}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {(stage === 'signing' || stage === 'mining') && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FilmStrip className="w-28" label={t(`stages.${stage}`)} />
              {approvalUrl ? (
                <a
                  href={approvalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-xs text-frame underline"
                >
                  {t('openApproval')}
                  <ExternalLink className="size-3" />
                </a>
              ) : stage === 'signing' ? (
                <div className="flex items-center gap-2">
                  <span className="font-mono text-2xs text-[#a39a90]">{t('checkWalletHint')}</span>
                  <a
                    href="kubwallet://"
                    className="inline-flex items-center gap-1 rounded-xs border border-frame/50 bg-frame/10 px-2 py-1 font-mono text-2xs text-frame hover:bg-frame/20"
                  >
                    <Wallet className="size-3" />
                    KUB Wallet
                  </a>
                </div>
              ) : (
                <span className="font-mono text-2xs text-[#a39a90]">{t('waitingBlockHint')}</span>
              )}
            </div>
          )}

          {stage === 'failed' && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-danger">
                  {task.errorCode
                    ? t(`errors.${task.errorCode}` as Parameters<typeof t>[0])
                    : t('errors.unknown')}
                </span>
                {task.errorCode === 'insufficient-funds' && activeChain.id === 25925 && (
                  <a
                    href="https://faucet.kubchain.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-2xs text-frame underline"
                  >
                    faucet.kubchain.com (tKUB ฟรี)
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="primary" size="sm" onClick={onConfirm}>
                  <Check />
                  {t('confirmBtn')}
                </Button>
                {onSignWallet && (
                  <Button variant="secondary" size="sm" onClick={onRetry}>
                    <RefreshCcw />
                    {t('retryBtn')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
