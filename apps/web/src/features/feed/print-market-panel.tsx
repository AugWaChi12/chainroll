'use client'

import { chainRollPrintsAbi } from '@chainroll/contracts'
import {
  activeChain,
  chainRollPrintsContract,
  classifyTxError,
  getKubBalance,
  waitForKubTxReceipt,
} from '@/features/wallet'
import { Badge, Button, Input, RebateLabel, TxHash, truncateHash } from '@chainroll/ui'
import { Check, Coins, Gavel, Sparkles, Tag, X } from 'lucide-react'
import type { Route } from 'next'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { keccak256, parseEther, stringToHex, type Address } from 'viem'
import { useWriteContract } from 'wagmi'
import { MarketBlockHud, type MarketBlockTask } from './market-block-hud'
import type { FeedPost } from './post-store'
import {
  acceptPreMintOffer,
  acceptPrintOffer,
  buyPrintEdition,
  calculateSettlement,
  cancelPreMintOffer,
  cancelPrintOffer,
  getPreMintOffers,
  getPrintForPost,
  highestOfferOf,
  highestPreMintOfferOf,
  makePreMintOffer,
  makePrintOffer,
  minimumNextOfferKub,
  mintPrintEdition,
  setPrintAskPrice,
  usePrintMarketStore,
} from './print-market'

function offerExpirySec(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + 72 * 3600)
}

export function PrintMarketPanel({
  post,
  viewerAddress,
  onRequireConnect,
}: {
  post: FeedPost
  viewerAddress: string | null
  onRequireConnect: () => void
}) {
  const t = useTranslations('feed.market')
  const format = useFormatter()
  const { prints, preMintOffers } = usePrintMarketStore()

  const print = getPrintForPost(prints, post.id, post.photoHash)
  const topOffer = highestOfferOf(print)
  const preOffers = getPreMintOffers(preMintOffers, post.photoHash)
  const topPreOffer = highestPreMintOfferOf(preMintOffers, post.photoHash)
  const minOffer = minimumNextOfferKub(topOffer?.amountKub ?? topPreOffer?.amountKub)

  const [mintPriceInput, setMintPriceInput] = useState<string>('4.5')
  const [editPriceInput, setEditPriceInput] = useState<string>(
    print?.askPriceKub ? String(print.askPriceKub) : '',
  )
  const [editingPrice, setEditingPrice] = useState<boolean>(false)
  const [offerInput, setOfferInput] = useState<string>(String(minOffer))
  const [offerError, setOfferError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [kubBalance, setKubBalance] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    if (!viewerAddress) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear balance on disconnect
      setKubBalance(null)
      return
    }
    void getKubBalance(viewerAddress as Address).then((bal) => {
      if (alive) setKubBalance(bal)
    })
    return () => {
      alive = false
    }
  }, [viewerAddress])

  const checkSufficientKub = async (requiredKub: number): Promise<boolean> => {
    if (!viewerAddress) return false
    const liveBal = await getKubBalance(viewerAddress as Address)
    const bal = liveBal ?? kubBalance
    if (liveBal !== null) setKubBalance(liveBal)
    if (bal !== null && bal < requiredKub) {
      setOfferError(
        t('errors.insufficientBalance', {
          balance: bal.toFixed(4),
          required: requiredKub.toFixed(2),
        }),
      )
      return false
    }
    return true
  }
  const { writeContractAsync } = useWriteContract()
  const [pendingTx, setPendingTx] = useState<{
    task: MarketBlockTask
    sendOnChain: () => Promise<`0x${string}`>
    run: (txHash: `0x${string}`) => void
  } | null>(null)

  const queueBlockTx = (
    task: Omit<MarketBlockTask, 'stage' | 'digest'> & { digestSeed: string },
    sendOnChain: () => Promise<`0x${string}`>,
    run: (txHash: `0x${string}`) => void,
  ) => {
    setPendingTx({
      task: {
        badge: task.badge,
        headline: task.headline,
        contractFn: task.contractFn,
        valueKub: task.valueKub,
        digest: keccak256(stringToHex(task.digestSeed)),
        stage: 'awaiting-confirm',
      },
      sendOnChain,
      run,
    })
  }

  const confirmBlockTx = async () => {
    if (!pendingTx) return
    const { task, sendOnChain, run } = pendingTx
    setPendingTx({ task: { ...task, stage: 'signing', errorMessage: undefined }, sendOnChain, run })
    try {
      const txHash = await sendOnChain()
      setPendingTx({ task: { ...task, stage: 'mining', txHash }, sendOnChain, run })
      const blockNumber = await waitForKubTxReceipt(txHash)
      run(txHash)
      setPendingTx({ task: { ...task, stage: 'confirmed', txHash, blockNumber }, sendOnChain, run })
      window.setTimeout(() => {
        setPendingTx((cur) => (cur?.task.digest === task.digest ? null : cur))
      }, 2400)
    } catch (err) {
      const { code, reason } = classifyTxError(err)
      setPendingTx({
        task: {
          ...task,
          stage: 'failed',
          errorMessage: reason ? `${code}: ${reason}` : code,
        },
        sendOnChain,
        run,
      })
    }
  }

  const isPhotographer = Boolean(
    viewerAddress && viewerAddress.toLowerCase() === post.shooter.toLowerCase(),
  )
  const isPrintOwner = Boolean(
    print && viewerAddress && viewerAddress.toLowerCase() === print.owner.toLowerCase(),
  )
  const isSecondary = Boolean(
    print && print.owner.toLowerCase() !== print.photographer.toLowerCase(),
  )

  const txBase = activeChain.blockExplorers?.default.url
    ? `${activeChain.blockExplorers.default.url}/tx/`
    : undefined

  const handleMint = () => {
    if (!viewerAddress) {
      onRequireConnect()
      return
    }
    if (!chainRollPrintsContract) return
    const parsed = Number(mintPriceInput)
    const ask = Number.isFinite(parsed) && parsed > 0 ? parsed : null
    queueBlockTx(
      {
        badge: 'MINT 1/1',
        headline: t('mintBtn'),
        contractFn: `ChainRollPrints.mintPrint(#${post.rollId}, ${post.frame}, ${ask ?? 0})`,
        digestSeed: `mint:${post.photoHash}:${ask ?? 0}`,
      },
      () =>
        writeContractAsync({
          address: chainRollPrintsContract!,
          abi: chainRollPrintsAbi,
          chainId: activeChain.id,
          functionName: 'mintPrint',
          args: [
            BigInt(post.rollId),
            post.frame,
            post.photoHash as `0x${string}`,
            ask ? parseEther(String(ask)) : 0n,
          ],
        }),
      () => {
        const minted = mintPrintEdition({
          postId: post.id,
          photoHash: post.photoHash,
          rollId: post.rollId,
          frame: post.frame,
          filmId: post.filmId,
          photographer: viewerAddress,
          askPriceKub: ask,
        })
        setNotice(t('notices.minted', { tokenId: String(minted.tokenId).padStart(2, '0') }))
      },
    )
  }

  const handleUpdatePrice = (delist = false) => {
    if (!print || !viewerAddress || !chainRollPrintsContract) return
    const parsed = delist ? null : Number(editPriceInput)
    const ask = parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null
    queueBlockTx(
      {
        badge: `1/1 #${String(print.tokenId).padStart(2, '0')}`,
        headline: ask ? t('savePrice') : t('delistBtn'),
        contractFn: `ChainRollPrints.setAskPrice(#${print.tokenId}, ${ask ?? 0})`,
        digestSeed: `ask:${print.tokenId}:${ask ?? 0}`,
      },
      () =>
        writeContractAsync({
          address: chainRollPrintsContract!,
          abi: chainRollPrintsAbi,
          chainId: activeChain.id,
          functionName: 'setAskPrice',
          args: [BigInt(print.tokenId), ask ? parseEther(String(ask)) : 0n],
        }),
      () => {
        setPrintAskPrice({ tokenId: print.tokenId, actor: viewerAddress, askPriceKub: ask })
        setEditingPrice(false)
        setNotice(ask ? t('notices.priceUpdated', { price: ask }) : t('notices.delisted'))
      },
    )
  }

  const handleBuyNow = async () => {
    if (!print || !print.askPriceKub || !chainRollPrintsContract) return
    if (!viewerAddress) {
      onRequireConnect()
      return
    }
    setOfferError(null)
    const price = print.askPriceKub
    if (!(await checkSufficientKub(price))) return
    queueBlockTx(
      {
        badge: `BUY 1/1 #${String(print.tokenId).padStart(2, '0')}`,
        headline: t('buyNowBtn', { price: price.toFixed(2) }),
        contractFn: `ChainRollPrints.buyPrint(#${print.tokenId})`,
        valueKub: price,
        digestSeed: `buy:${print.tokenId}:${viewerAddress}:${price}`,
      },
      () =>
        writeContractAsync({
          address: chainRollPrintsContract!,
          abi: chainRollPrintsAbi,
          chainId: activeChain.id,
          functionName: 'buyPrint',
          args: [BigInt(print.tokenId)],
          value: parseEther(String(price)),
        }),
      () => {
        if (buyPrintEdition({ tokenId: print.tokenId, buyer: viewerAddress })) {
          setNotice(t('notices.bought', { price }))
        }
      },
    )
  }

  const handleMakeOffer = async () => {
    if (!print || !chainRollPrintsContract) return
    if (!viewerAddress) {
      onRequireConnect()
      return
    }
    setOfferError(null)
    const amount = Number(offerInput)
    if (!Number.isFinite(amount) || amount <= 0) {
      setOfferError(t('errors.invalidAmount'))
      return
    }
    if (amount < minOffer) {
      setOfferError(t('errors.offerTooLow', { min: minOffer }))
      return
    }
    if (!(await checkSufficientKub(amount))) return
    const expiresAt = offerExpirySec()
    queueBlockTx(
      {
        badge: `OFFER 1/1 #${String(print.tokenId).padStart(2, '0')}`,
        headline: `${t('makeOfferBtn')} · ${amount.toFixed(2)} KUB`,
        contractFn: `ChainRollPrints.makeOffer(#${print.tokenId}, ${amount.toFixed(2)} KUB)`,
        valueKub: amount,
        digestSeed: `offer:${print.tokenId}:${viewerAddress}:${amount}`,
      },
      () =>
        writeContractAsync({
          address: chainRollPrintsContract!,
          abi: chainRollPrintsAbi,
          chainId: activeChain.id,
          functionName: 'makeOffer',
          args: [BigInt(print.tokenId), expiresAt],
          value: parseEther(String(amount)),
        }),
      () => {
        const res = makePrintOffer({
          tokenId: print.tokenId,
          bidder: viewerAddress,
          amountKub: amount,
        })
        if (!res.ok) {
          setOfferError(t('errors.offerTooLow', { min: res.minRequired }))
          return
        }
        setNotice(t('notices.offerPlaced', { amount: amount.toFixed(2) }))
        setOfferInput(String(minimumNextOfferKub(amount)))
      },
    )
  }

  // ── Unminted state (supports Pre-Mint Escrow Offers!) ──
  if (!print) {
    const handlePreMintOffer = async () => {
      if (!viewerAddress) {
        onRequireConnect()
        return
      }
      setOfferError(null)
      const amount = Number(offerInput)
      if (!Number.isFinite(amount) || amount <= 0) {
        setOfferError(t('errors.invalidAmount'))
        return
      }
      const minPre = minimumNextOfferKub(topPreOffer?.amountKub)
      if (amount < minPre) {
        setOfferError(t('errors.offerTooLow', { min: minPre }))
        return
      }
      if (!(await checkSufficientKub(amount))) return
      if (!chainRollPrintsContract) return
      const expiresAt = offerExpirySec()
      queueBlockTx(
        {
          badge: 'PRE-MINT OFFER',
          headline: `${t('preMintBtn')} · ${amount.toFixed(2)} KUB`,
          contractFn: `ChainRollPrints.makePreMintOffer(${amount.toFixed(2)} KUB)`,
          valueKub: amount,
          digestSeed: `premint:${post.photoHash}:${viewerAddress}:${amount}`,
        },
        () =>
          writeContractAsync({
            address: chainRollPrintsContract!,
            abi: chainRollPrintsAbi,
            chainId: activeChain.id,
            functionName: 'makePreMintOffer',
            args: [post.photoHash as `0x${string}`, expiresAt],
            value: parseEther(String(amount)),
          }),
        () => {
          const res = makePreMintOffer({
            photoHash: post.photoHash,
            bidder: viewerAddress,
            amountKub: amount,
          })
          if (!res.ok) {
            setOfferError(t('errors.offerTooLow', { min: res.minRequired }))
            return
          }
          setNotice(t('preMintNoticePlaced', { amount: amount.toFixed(2) }))
          setOfferInput(String(minimumNextOfferKub(amount)))
        },
      )
    }

    const handleAcceptPreMint = (offerId: string, amountKub: number) => {
      if (!viewerAddress || !isPhotographer || !chainRollPrintsContract) return
      queueBlockTx(
        {
          badge: 'MINT & ACCEPT',
          headline: t('preMintAcceptBtn', { amount: amountKub.toFixed(2) }),
          contractFn: `ChainRollPrints.acceptPreMintOffer(${amountKub.toFixed(2)} KUB)`,
          digestSeed: `acceptPremint:${post.photoHash}:${offerId}`,
        },
        () =>
          writeContractAsync({
            address: chainRollPrintsContract!,
            abi: chainRollPrintsAbi,
            chainId: activeChain.id,
            functionName: 'acceptPreMintOffer',
            args: [post.photoHash as `0x${string}`, parseEther(String(amountKub))],
          }),
        () => {
          const created = acceptPreMintOffer({
            postId: post.id,
            photoHash: post.photoHash,
            rollId: post.rollId,
            frame: post.frame,
            filmId: post.filmId,
            photographer: post.shooter,
            offerId,
          })
          if (created) {
            setNotice(
              t('preMintNoticeAccepted', {
                tokenId: created.tokenId,
                amount: amountKub.toFixed(2),
              }),
            )
          }
        },
      )
    }

    return (
      <section className="flex flex-col gap-3.5 border border-border bg-bg-raised p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-frame" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-fg">
              {t('unmintedTitle')}
            </h2>
          </div>
          <Badge tone="neutral">ERC-721 · 1/1</Badge>
        </div>

        <p className="text-xs leading-relaxed text-fg-muted">{t('unmintedBody')}</p>

        {notice && (
          <p className="border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
            {notice}
          </p>
        )}

        {/* Active Pre-Mint Offers */}
        {preOffers.length > 0 && (
          <div className="flex flex-col gap-2 border border-frame/40 bg-frame/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-2xs font-medium text-frame">
                ▸ {t('preMintBanner', { amount: preOffers[0]!.amountKub.toFixed(2) })}
              </span>
              <span className="font-mono text-2xs text-fg-muted">
                {preOffers[0]!.bidderHandle
                  ? `@${preOffers[0]!.bidderHandle}`
                  : truncateHash(preOffers[0]!.bidder)}
              </span>
            </div>
            {isPhotographer && (
              <div className="flex flex-col gap-2 border-t border-frame/25 pt-2">
                <span className="font-mono text-2xs text-fg-muted">
                  {t('preMintNetHint', {
                    net: calculateSettlement(preOffers[0]!.amountKub, false).sellerNetKub.toFixed(
                      2,
                    ),
                  })}
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    handleAcceptPreMint(preOffers[0]!.id, preOffers[0]!.amountKub)
                  }
                >
                  <Check />
                  {t('preMintAcceptBtn', { amount: preOffers[0]!.amountKub.toFixed(2) })}
                </Button>
              </div>
            )}
            {preOffers.map((o) => {
              const isMine =
                viewerAddress && o.bidder.toLowerCase() === viewerAddress.toLowerCase()
              if (!isMine) return null
              return (
                <div
                  key={o.id}
                  className="flex items-center justify-between border-t border-frame/20 pt-2 text-xs"
                >
                  <span className="font-mono tabular text-fg">
                    {o.amountKub.toFixed(2)} KUB
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      cancelPreMintOffer({
                        photoHash: post.photoHash,
                        offerId: o.id,
                        bidder: viewerAddress!,
                      })
                    }
                  >
                    {t('cancelOfferBtn')}
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        {isPhotographer ? (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <Input
              label={t('mintPriceLabel')}
              hint={t('mintPriceHint')}
              type="number"
              min={0}
              step={0.1}
              value={mintPriceInput}
              onChange={(e) => setMintPriceInput(e.target.value)}
              trailing="KUB"
            />
            <Button variant="primary" size="sm" onClick={handleMint}>
              <Sparkles />
              {t('mintBtn')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-fg">{t('preMintTitle')}</span>
              <span className="font-mono text-2xs text-fg-subtle">
                {t('minOfferHint', {
                  min: minimumNextOfferKub(topPreOffer?.amountKub),
                })}
              </span>
            </div>
            <p className="text-2xs text-fg-muted">{t('preMintHint')}</p>
            {kubBalance !== null && (
              <span className="font-mono text-2xs text-fg-subtle">
                {t('walletBalance', { balance: kubBalance.toFixed(4) })}
              </span>
            )}
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <Input
                type="number"
                min={0.1}
                step={0.1}
                value={offerInput}
                onChange={(e) => {
                  setOfferInput(e.target.value)
                  setOfferError(null)
                }}
                trailing="KUB"
                className="min-w-0 flex-1"
              />
              <Button variant="secondary" size="sm" onClick={() => void handlePreMintOffer()}>
                <Gavel />
                {t('preMintBtn')}
              </Button>
            </div>
            {offerError && <p className="text-xs text-danger">{offerError}</p>}
          </div>
        )}
        {pendingTx && (
          <MarketBlockHud
            task={pendingTx.task}
            onConfirm={confirmBlockTx}
            onDismiss={() => setPendingTx(null)}
          />
        )}
      </section>
    )
  }

  // ── Minted 1/1 Print state ──
  const previewPrice =
    print.askPriceKub ?? (Number(offerInput) > 0 ? Number(offerInput) : topOffer?.amountKub ?? 1)
  const breakdown = calculateSettlement(previewPrice, isSecondary)

  return (
    <section className="flex flex-col gap-4 border border-frame/45 bg-bg-raised p-4 shadow-[inset_2px_0_0_var(--frame)]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border pb-3">
        <div className="flex flex-col gap-1">
          <RebateLabel>
            1/1 PRINT #{String(print.tokenId).padStart(2, '0')} · ERC-721
          </RebateLabel>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-fg-muted">
              {t('owner')}:{' '}
              <Link
                href={`/u/${print.owner}` as Route}
                className="font-mono font-medium text-fg underline decoration-border-strong underline-offset-4 hover:decoration-fg"
              >
                {print.ownerHandle ?? truncateHash(print.owner)}
              </Link>
            </span>
            <span className="font-mono text-2xs text-fg-subtle">
              {t('royaltyTag', { pct: (print.royaltyBps / 100).toFixed(0) })}
            </span>
          </div>
        </div>
        <Badge tone={print.askPriceKub ? 'frame' : 'info'} dot>
          {print.askPriceKub
            ? `${print.askPriceKub.toFixed(2)} KUB`
            : t('openForOffers')}
        </Badge>
      </div>

      {notice && (
        <div
          role="status"
          className="flex items-center justify-between border border-success/40 bg-bg px-3 py-2 text-xs text-success"
        >
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label={t('close')}
            className="text-fg-subtle hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Buy Now / Owner Listing Controls */}
      <div className="flex flex-col gap-2.5 border border-border bg-bg p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col">
            <span className="text-2xs uppercase tracking-wider text-fg-subtle">
              {print.askPriceKub ? t('buyNowLabel') : t('statusLabel')}
            </span>
            <span className="font-mono text-xl font-semibold tabular text-fg">
              {print.askPriceKub
                ? `${print.askPriceKub.toFixed(2)} KUB`
                : t('openForOffers')}
            </span>
            {print.lastSaleKub && (
              <span className="font-mono text-2xs text-fg-subtle">
                {t('lastSale', { price: print.lastSaleKub.toFixed(2) })}
              </span>
            )}
          </div>

          {isPrintOwner ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setEditPriceInput(print.askPriceKub ? String(print.askPriceKub) : '')
                setEditingPrice((v) => !v)
              }}
            >
              <Tag />
              {t('manageListing')}
            </Button>
          ) : (
            print.askPriceKub && (
              <Button variant="primary" size="sm" onClick={() => void handleBuyNow()}>
                <Coins />
                {t('buyNowBtn', { price: print.askPriceKub.toFixed(2) })}
              </Button>
            )
          )}
        </div>

        {isPrintOwner && editingPrice && (
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2.5">
            <div className="min-w-36 flex-1">
              <Input
                label={t('newPriceLabel')}
                type="number"
                min={0}
                step={0.1}
                value={editPriceInput}
                onChange={(e) => setEditPriceInput(e.target.value)}
                trailing="KUB"
              />
            </div>
            <Button variant="primary" size="sm" onClick={() => handleUpdatePrice(false)}>
              <Check />
              {t('savePrice')}
            </Button>
            {print.askPriceKub && (
              <Button variant="ghost" size="sm" onClick={() => handleUpdatePrice(true)}>
                {t('delistBtn')}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Make an Offer (for non-owners) */}
      {!isPrintOwner && (
        <div className="flex flex-col gap-2.5 border border-border bg-bg p-3">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-fg">
              <Gavel className="size-3.5 shrink-0 text-frame" />
              <span>{t('makeOfferTitle')}</span>
            </span>
            <span className="font-mono text-2xs text-fg-subtle">
              {t('minOfferHint', { min: minOffer.toFixed(2) })}
            </span>
          </div>

          <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
            <div className="min-w-0 flex-1">
              <Input
                type="number"
                min={minOffer}
                step={0.1}
                value={offerInput}
                error={offerError ?? undefined}
                onChange={(e) => {
                  setOfferInput(e.target.value)
                  setOfferError(null)
                }}
                trailing="KUB"
              />
            </div>
            <Button
              variant="secondary"
              className="w-full shrink-0 sm:w-auto"
              onClick={() => void handleMakeOffer()}
            >
              <Gavel />
              {t('makeOfferBtn')}
            </Button>
          </div>
          {kubBalance !== null && (
            <span className="font-mono text-2xs text-fg-subtle">
              {t('walletBalance', { balance: kubBalance.toFixed(4) })}
            </span>
          )}
        </div>
      )}

      {/* Settlement & Royalty Transparency Breakdown */}
      <dl className="grid grid-cols-1 gap-px border border-border bg-border font-mono text-2xs sm:grid-cols-3">
        <div className="flex items-center justify-between gap-2 bg-bg p-2.5 sm:flex-col sm:items-start sm:gap-0.5">
          <dt className="truncate text-fg-subtle">{t('breakdown.sellerNet')}</dt>
          <dd className="font-semibold tabular text-fg">{breakdown.sellerNetKub.toFixed(2)} KUB</dd>
        </div>
        <div className="flex items-center justify-between gap-2 bg-bg p-2.5 sm:flex-col sm:items-start sm:gap-0.5">
          <dt className="truncate text-fg-subtle">{t('breakdown.royalty')}</dt>
          <dd className="tabular text-frame">
            {isSecondary ? `${breakdown.royaltyKub.toFixed(2)} KUB (5%)` : t('breakdown.primary')}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2 bg-bg p-2.5 sm:flex-col sm:items-start sm:gap-0.5">
          <dt className="truncate text-fg-subtle">{t('breakdown.protocol')}</dt>
          <dd className="tabular text-fg-muted">{breakdown.protocolFeeKub.toFixed(2)} KUB (2.5%)</dd>
        </div>
      </dl>

      {/* Active Escrow Offers Book */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
            {t('offersTitle')} ({print.offers.length})
          </span>
          {topOffer && (
            <span className="font-mono text-2xs text-frame">
              ▸ {t('highestOffer', { amount: topOffer.amountKub.toFixed(2) })}
            </span>
          )}
        </div>

        {print.offers.length === 0 ? (
          <p className="border border-dashed border-border px-3 py-2.5 text-xs text-fg-subtle">
            {t('noOffersYet')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border border border-border bg-bg">
            {print.offers.map((off) => {
              const isMyBid = Boolean(
                viewerAddress && viewerAddress.toLowerCase() === off.bidder.toLowerCase(),
              )
              return (
                <li
                  key={off.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold tabular text-frame">
                      {off.amountKub.toFixed(2)} KUB
                    </span>
                    <Link
                      href={`/u/${off.bidder}` as Route}
                      className="font-mono text-fg hover:underline"
                    >
                      {off.bidderHandle ?? truncateHash(off.bidder)}
                    </Link>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-mono text-2xs tabular text-fg-subtle">
                      {format.relativeTime(new Date(off.createdAt), new Date())}
                    </span>
                    {isPrintOwner && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          if (!viewerAddress || !chainRollPrintsContract) return
                          queueBlockTx(
                            {
                              badge: `ACCEPT #${String(print.tokenId).padStart(2, '0')}`,
                              headline: `${t('acceptOfferBtn')} · ${off.amountKub.toFixed(2)} KUB`,
                              contractFn: `ChainRollPrints.acceptOffer(#${print.tokenId}, ${off.amountKub.toFixed(2)} KUB)`,
                              digestSeed: `accept:${print.tokenId}:${off.id}`,
                            },
                            () =>
                              writeContractAsync({
                                address: chainRollPrintsContract!,
                                abi: chainRollPrintsAbi,
                                chainId: activeChain.id,
                                functionName: 'acceptOffer',
                                args: [BigInt(print.tokenId), parseEther(String(off.amountKub))],
                              }),
                            () => {
                              if (
                                acceptPrintOffer({
                                  tokenId: print.tokenId,
                                  offerId: off.id,
                                  seller: viewerAddress,
                                })
                              ) {
                                setNotice(
                                  t('notices.offerAccepted', {
                                    amount: off.amountKub.toFixed(2),
                                  }),
                                )
                              }
                            },
                          )
                        }}
                      >
                        <Check />
                        {t('acceptOfferBtn')}
                      </Button>
                    )}
                    {isMyBid && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          viewerAddress &&
                          cancelPrintOffer({
                            tokenId: print.tokenId,
                            offerId: off.id,
                            bidder: viewerAddress,
                          })
                        }
                      >
                        {t('cancelOfferBtn')}
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Provenance Ledger */}
      <div className="flex flex-col gap-1.5 border-t border-border pt-3">
        <span className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
          {t('provenanceTitle')}
        </span>
        <ul className="flex max-h-40 flex-col divide-y divide-border/60 overflow-y-auto font-mono text-2xs">
          {print.history.map((ev) => (
            <li
              key={ev.id}
              className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 py-1.5 text-fg-muted first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="text-frame">▸</span>
                <span className="text-fg">{t(`events.${ev.kind}`)}</span>
                <span className="truncate">by {ev.actorHandle ?? truncateHash(ev.actor)}</span>
                {ev.amountKub !== undefined && (
                  <span className="text-frame">({ev.amountKub.toFixed(2)} KUB)</span>
                )}
              </div>
              <TxHash hash={ev.txHash} explorerUrl={txBase} />
            </li>
          ))}
        </ul>
      </div>

      {pendingTx && (
        <MarketBlockHud
          task={pendingTx.task}
          onConfirm={confirmBlockTx}
          onDismiss={() => setPendingTx(null)}
        />
      )}
    </section>
  )
}
