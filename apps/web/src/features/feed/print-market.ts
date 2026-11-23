'use client'

import { useSyncExternalStore } from 'react'
import { SEED_POSTS, handleForAddress } from './post-store'

export const ROYALTY_BPS = 500 // 5.0% perpetual photographer royalty (ERC-2981)
export const PROTOCOL_FEE_BPS = 250 // 2.5% protocol fee
export const MIN_OUTBID_BPS = 500 // 5.0% minimum outbid step

export type PrintOffer = {
  id: string
  bidder: string
  bidderHandle: string | null
  amountKub: number
  createdAt: number
  expiresAt: number
  txHash: string
}

export type PrintProvenanceKind =
  | 'minted'
  | 'listed'
  | 'offer_made'
  | 'offer_cancelled'
  | 'offer_accepted'
  | 'bought'

export type PrintProvenanceEvent = {
  id: string
  kind: PrintProvenanceKind
  actor: string
  actorHandle: string | null
  amountKub?: number
  txHash: string
  timestamp: number
}

export type PrintEdition = {
  tokenId: number
  postId: string
  photoHash: string
  rollId: number
  frame: number
  filmId: number
  photographer: string
  owner: string
  ownerHandle: string | null
  /** null = not listed for instant buy (still open for offers) */
  askPriceKub: number | null
  royaltyBps: number
  protocolFeeBps: number
  mintedAt: number
  mintTxHash: string
  lastSaleKub: number | null
  offers: PrintOffer[]
  history: PrintProvenanceEvent[]
}

export type SettlementBreakdown = {
  priceKub: number
  royaltyKub: number
  protocolFeeKub: number
  sellerNetKub: number
}

/**
 * Computes exact settlement breakdown matching `ChainRollPrints._settleSale` in Solidity.
 * Primary sales (where seller === photographer) do not deduct a separate royalty slice.
 */
export function calculateSettlement(
  priceKub: number,
  isSecondarySale: boolean,
): SettlementBreakdown {
  const clean = Math.max(0, Number(priceKub) || 0)
  const royaltyKub = isSecondarySale ? Number(((clean * ROYALTY_BPS) / 10_000).toFixed(4)) : 0
  const protocolFeeKub = Number(((clean * PROTOCOL_FEE_BPS) / 10_000).toFixed(4))
  const sellerNetKub = Number(Math.max(0, clean - royaltyKub - protocolFeeKub).toFixed(4))
  return {
    priceKub: clean,
    royaltyKub,
    protocolFeeKub,
    sellerNetKub,
  }
}

/** Minimum KUB required to outbid the current highest active offer (+5%). */
export function minimumNextOfferKub(highestOfferKub: number | null | undefined): number {
  if (!highestOfferKub || highestOfferKub <= 0) return 0.5
  return Number((highestOfferKub * (1 + MIN_OUTBID_BPS / 10_000)).toFixed(2))
}

function hex(seed: number, len: number) {
  let s = seed
  let out = ''
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff
    out += ((s >>> 16) % 16).toString(16)
  }
  return out
}

const STORAGE_KEY = 'chainroll.prints.market.v1'
const REF_TIME = Date.UTC(2026, 10, 22, 12, 0, 0)

const p101 = SEED_POSTS[0]!
const p102 = SEED_POSTS[1]!
const p103 = SEED_POSTS[2]!
const p105 = SEED_POSTS[4]!

const COLLECTOR_MINT = `0x${hex(706, 40)}`
const COLLECTOR_KEN = `0x${hex(709, 40)}`

export const SEED_PRINTS: PrintEdition[] = [
  {
    tokenId: 1,
    postId: p101.id,
    photoHash: p101.photoHash,
    rollId: p101.rollId,
    frame: p101.frame,
    filmId: p101.filmId,
    photographer: p101.shooter,
    owner: p101.shooter,
    ownerHandle: p101.handle,
    askPriceKub: 4.5,
    royaltyBps: ROYALTY_BPS,
    protocolFeeBps: PROTOCOL_FEE_BPS,
    mintedAt: REF_TIME - 30 * 60_000,
    mintTxHash: `0x${hex(8101, 64)}`,
    lastSaleKub: null,
    offers: [
      {
        id: 'off-101',
        bidder: p102.shooter,
        bidderHandle: p102.handle,
        amountKub: 3.8,
        createdAt: REF_TIME - 18 * 60_000,
        expiresAt: REF_TIME + 48 * 3600_000,
        txHash: `0x${hex(8201, 64)}`,
      },
      {
        id: 'off-100',
        bidder: COLLECTOR_KEN,
        bidderHandle: 'ken.bkk',
        amountKub: 3.2,
        createdAt: REF_TIME - 25 * 60_000,
        expiresAt: REF_TIME + 24 * 3600_000,
        txHash: `0x${hex(8200, 64)}`,
      },
    ],
    history: [
      {
        id: 'ev-102',
        kind: 'offer_made',
        actor: p102.shooter,
        actorHandle: p102.handle,
        amountKub: 3.8,
        txHash: `0x${hex(8201, 64)}`,
        timestamp: REF_TIME - 18 * 60_000,
      },
      {
        id: 'ev-101',
        kind: 'minted',
        actor: p101.shooter,
        actorHandle: p101.handle,
        amountKub: 4.5,
        txHash: `0x${hex(8101, 64)}`,
        timestamp: REF_TIME - 30 * 60_000,
      },
    ],
  },
  {
    tokenId: 2,
    postId: p103.id,
    photoHash: p103.photoHash,
    rollId: p103.rollId,
    frame: p103.frame,
    filmId: p103.filmId,
    photographer: p103.shooter,
    owner: COLLECTOR_MINT,
    ownerHandle: 'mint_roll',
    askPriceKub: null,
    royaltyBps: ROYALTY_BPS,
    protocolFeeBps: PROTOCOL_FEE_BPS,
    mintedAt: REF_TIME - 210 * 60_000,
    mintTxHash: `0x${hex(8102, 64)}`,
    lastSaleKub: 6.0,
    offers: [
      {
        id: 'off-201',
        bidder: COLLECTOR_KEN,
        bidderHandle: 'ken.bkk',
        amountKub: 7.5,
        createdAt: REF_TIME - 45 * 60_000,
        expiresAt: REF_TIME + 72 * 3600_000,
        txHash: `0x${hex(8202, 64)}`,
      },
    ],
    history: [
      {
        id: 'ev-203',
        kind: 'offer_made',
        actor: COLLECTOR_KEN,
        actorHandle: 'ken.bkk',
        amountKub: 7.5,
        txHash: `0x${hex(8202, 64)}`,
        timestamp: REF_TIME - 45 * 60_000,
      },
      {
        id: 'ev-202',
        kind: 'bought',
        actor: COLLECTOR_MINT,
        actorHandle: 'mint_roll',
        amountKub: 6.0,
        txHash: `0x${hex(8199, 64)}`,
        timestamp: REF_TIME - 140 * 60_000,
      },
      {
        id: 'ev-201',
        kind: 'minted',
        actor: p103.shooter,
        actorHandle: p103.handle,
        amountKub: 6.0,
        txHash: `0x${hex(8102, 64)}`,
        timestamp: REF_TIME - 210 * 60_000,
      },
    ],
  },
  {
    tokenId: 3,
    postId: p105.id,
    photoHash: p105.photoHash,
    rollId: p105.rollId,
    frame: p105.frame,
    filmId: p105.filmId,
    photographer: p105.shooter,
    owner: p105.shooter,
    ownerHandle: p105.handle,
    askPriceKub: 5.2,
    royaltyBps: ROYALTY_BPS,
    protocolFeeBps: PROTOCOL_FEE_BPS,
    mintedAt: REF_TIME - 600 * 60_000,
    mintTxHash: `0x${hex(8103, 64)}`,
    lastSaleKub: null,
    offers: [],
    history: [
      {
        id: 'ev-301',
        kind: 'minted',
        actor: p105.shooter,
        actorHandle: p105.handle,
        amountKub: 5.2,
        txHash: `0x${hex(8103, 64)}`,
        timestamp: REF_TIME - 600 * 60_000,
      },
    ],
  },
]

type PrintMarketState = {
  prints: PrintEdition[]
  preMintOffers: Record<string, PrintOffer[]>
}

const PREMINT_STORAGE_KEY = 'chainroll.premint.v1'

let state: PrintMarketState = {
  prints: SEED_PRINTS,
  preMintOffers: {},
}

let hydrated = false

function hydrateOnce() {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const rawPre = window.localStorage.getItem(PREMINT_STORAGE_KEY)
    const parsedPrints = raw ? (JSON.parse(raw) as PrintEdition[]) : null
    const parsedPre = rawPre ? (JSON.parse(rawPre) as Record<string, PrintOffer[]>) : null
    state = {
      prints: Array.isArray(parsedPrints) && parsedPrints.length > 0 ? parsedPrints : state.prints,
      preMintOffers: parsedPre && typeof parsedPre === 'object' ? parsedPre : {},
    }
  } catch {
    /* ignore */
  }

  const pullFromApi = () => {
    if (typeof window.fetch !== 'function') return
    void window
      .fetch('/api/state', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            ok?: boolean
            prints?: PrintEdition[]
            preMintOffers?: Record<string, PrintOffer[]>
          } | null,
        ) => {
          if (!data?.ok) return
          state = {
            prints:
              Array.isArray(data.prints) && data.prints.length > 0 ? data.prints : state.prints,
            preMintOffers:
              data.preMintOffers && typeof data.preMintOffers === 'object'
                ? data.preMintOffers
                : state.preMintOffers,
          }
          persist()
          emit()
        },
      )
      .catch(() => {})
  }
  pullFromApi()
  window.addEventListener('chainroll:wallet-connected', pullFromApi)
}

function syncDbMutation(payload: unknown) {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return
  void window
    .fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    .catch(() => {})
}

function syncPrintToDb(print: PrintEdition | undefined) {
  if (!print) return
  syncDbMutation({ type: 'print.upsert', print })
}

function persist() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.prints))
    window.localStorage.setItem(PREMINT_STORAGE_KEY, JSON.stringify(state.preMintOffers))
  } catch {
    /* ignore */
  }
}

const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

function subscribe(listener: () => void) {
  hydrateOnce()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return state
}

export function usePrintMarketStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function getPrintForPost(
  prints: readonly PrintEdition[],
  postId: string,
  photoHash?: string,
): PrintEdition | undefined {
  return prints.find(
    (p) =>
      p.postId === postId ||
      (photoHash && p.photoHash.toLowerCase() === photoHash.toLowerCase()),
  )
}

export function highestOfferOf(print: PrintEdition | undefined): PrintOffer | null {
  if (!print || print.offers.length === 0) return null
  return [...print.offers].sort((a, b) => b.amountKub - a.amountKub)[0] ?? null
}

function genTxHash(): string {
  return `0x${hex(Date.now() & 0x7fffffff, 64)}`
}

export function mintPrintEdition(input: {
  postId: string
  photoHash: string
  rollId: number
  frame: number
  filmId: number
  photographer: string
  askPriceKub: number | null
}): PrintEdition {
  hydrateOnce()
  const existing = getPrintForPost(state.prints, input.postId, input.photoHash)
  if (existing) return existing

  const tokenId = state.prints.reduce((max, p) => Math.max(max, p.tokenId), 0) + 1
  const txHash = genTxHash()
  const now = Date.now()
  const handle = handleForAddress(input.photographer)
  const cleanAsk =
    input.askPriceKub !== null && input.askPriceKub > 0
      ? Number(input.askPriceKub.toFixed(2))
      : null

  const edition: PrintEdition = {
    tokenId,
    postId: input.postId,
    photoHash: input.photoHash,
    rollId: input.rollId,
    frame: input.frame,
    filmId: input.filmId,
    photographer: input.photographer,
    owner: input.photographer,
    ownerHandle: handle,
    askPriceKub: cleanAsk,
    royaltyBps: ROYALTY_BPS,
    protocolFeeBps: PROTOCOL_FEE_BPS,
    mintedAt: now,
    mintTxHash: txHash,
    lastSaleKub: null,
    offers: [],
    history: [
      {
        id: `ev-${now}`,
        kind: 'minted',
        actor: input.photographer,
        actorHandle: handle,
        amountKub: cleanAsk ?? undefined,
        txHash,
        timestamp: now,
      },
    ],
  }

  state = { ...state, prints: [edition, ...state.prints] }
  persist()
  emit()
  syncPrintToDb(edition)
  return edition
}

export function setPrintAskPrice(input: {
  tokenId: number
  actor: string
  askPriceKub: number | null
}) {
  hydrateOnce()
  const now = Date.now()
  const txHash = genTxHash()
  const cleanAsk =
    input.askPriceKub !== null && input.askPriceKub > 0
      ? Number(input.askPriceKub.toFixed(2))
      : null

  state = {
    ...state,
    prints: state.prints.map((p) => {
      if (p.tokenId !== input.tokenId) return p
      if (p.owner.toLowerCase() !== input.actor.toLowerCase()) return p
      return {
        ...p,
        askPriceKub: cleanAsk,
        history: [
          {
            id: `ev-${now}`,
            kind: 'listed',
            actor: input.actor,
            actorHandle: handleForAddress(input.actor),
            amountKub: cleanAsk ?? undefined,
            txHash,
            timestamp: now,
          },
          ...p.history,
        ],
      }
    }),
  }
  persist()
  emit()
  syncPrintToDb(state.prints.find((p) => p.tokenId === input.tokenId))
}

export function buyPrintEdition(input: { tokenId: number; buyer: string }): boolean {
  hydrateOnce()
  const target = state.prints.find((p) => p.tokenId === input.tokenId)
  if (!target || !target.askPriceKub || target.askPriceKub <= 0) return false
  if (target.owner.toLowerCase() === input.buyer.toLowerCase()) return false

  const price = target.askPriceKub
  const now = Date.now()
  const txHash = genTxHash()
  const buyerHandle = handleForAddress(input.buyer)

  state = {
    ...state,
    prints: state.prints.map((p) =>
      p.tokenId !== input.tokenId
        ? p
        : {
            ...p,
            owner: input.buyer,
            ownerHandle: buyerHandle,
            askPriceKub: null,
            lastSaleKub: price,
            offers: p.offers.filter(
              (o) => o.bidder.toLowerCase() !== input.buyer.toLowerCase(),
            ),
            history: [
              {
                id: `ev-${now}`,
                kind: 'bought',
                actor: input.buyer,
                actorHandle: buyerHandle,
                amountKub: price,
                txHash,
                timestamp: now,
              },
              ...p.history,
            ],
          },
    ),
  }
  persist()
  emit()
  syncPrintToDb(state.prints.find((p) => p.tokenId === input.tokenId))
  return true
}

export function makePrintOffer(input: {
  tokenId: number
  bidder: string
  amountKub: number
  durationHours?: number
}): { ok: true } | { ok: false; minRequired: number } {
  hydrateOnce()
  const target = state.prints.find((p) => p.tokenId === input.tokenId)
  if (!target) return { ok: false, minRequired: 0.5 }
  const top = highestOfferOf(target)
  const minReq = minimumNextOfferKub(top?.amountKub)
  if (input.amountKub < minReq) {
    return { ok: false, minRequired: minReq }
  }

  const now = Date.now()
  const txHash = genTxHash()
  const bidderHandle = handleForAddress(input.bidder)
  const hours = input.durationHours ?? 48
  const newOffer: PrintOffer = {
    id: `off-${now}`,
    bidder: input.bidder,
    bidderHandle,
    amountKub: Number(input.amountKub.toFixed(2)),
    createdAt: now,
    expiresAt: now + hours * 3600_000,
    txHash,
  }

  state = {
    ...state,
    prints: state.prints.map((p) => {
      if (p.tokenId !== input.tokenId) return p
      const otherOffers = p.offers.filter(
        (o) => o.bidder.toLowerCase() !== input.bidder.toLowerCase(),
      )
      return {
        ...p,
        offers: [newOffer, ...otherOffers].sort((a, b) => b.amountKub - a.amountKub),
        history: [
          {
            id: `ev-${now}`,
            kind: 'offer_made',
            actor: input.bidder,
            actorHandle: bidderHandle,
            amountKub: newOffer.amountKub,
            txHash,
            timestamp: now,
          },
          ...p.history,
        ],
      }
    }),
  }
  persist()
  emit()
  syncPrintToDb(state.prints.find((p) => p.tokenId === input.tokenId))
  return { ok: true }
}

export function cancelPrintOffer(input: {
  tokenId: number
  offerId: string
  bidder: string
}) {
  hydrateOnce()
  const now = Date.now()
  const txHash = genTxHash()

  state = {
    ...state,
    prints: state.prints.map((p) => {
      if (p.tokenId !== input.tokenId) return p
      const target = p.offers.find((o) => o.id === input.offerId)
      if (!target || target.bidder.toLowerCase() !== input.bidder.toLowerCase()) return p
      return {
        ...p,
        offers: p.offers.filter((o) => o.id !== input.offerId),
        history: [
          {
            id: `ev-${now}`,
            kind: 'offer_cancelled',
            actor: input.bidder,
            actorHandle: handleForAddress(input.bidder),
            amountKub: target.amountKub,
            txHash,
            timestamp: now,
          },
          ...p.history,
        ],
      }
    }),
  }
  persist()
  emit()
  syncPrintToDb(state.prints.find((p) => p.tokenId === input.tokenId))
}

export function acceptPrintOffer(input: {
  tokenId: number
  offerId: string
  seller: string
}): boolean {
  hydrateOnce()
  const print = state.prints.find((p) => p.tokenId === input.tokenId)
  if (!print || print.owner.toLowerCase() !== input.seller.toLowerCase()) return false
  const offer = print.offers.find((o) => o.id === input.offerId)
  if (!offer) return false

  const now = Date.now()
  const txHash = genTxHash()

  state = {
    ...state,
    prints: state.prints.map((p) =>
      p.tokenId !== input.tokenId
        ? p
        : {
            ...p,
            owner: offer.bidder,
            ownerHandle: offer.bidderHandle,
            askPriceKub: null,
            lastSaleKub: offer.amountKub,
            offers: p.offers.filter((o) => o.id !== input.offerId),
            history: [
              {
                id: `ev-${now}`,
                kind: 'offer_accepted',
                actor: offer.bidder,
                actorHandle: offer.bidderHandle,
                amountKub: offer.amountKub,
                txHash,
                timestamp: now,
              },
              ...p.history,
            ],
          },
    ),
  }
  persist()
  emit()
  syncPrintToDb(state.prints.find((p) => p.tokenId === input.tokenId))
  return true
}

// ═══ Pre-Mint Offers (Bid on unminted frames) ══════════════

export function getPreMintOffers(
  preMintOffers: Record<string, PrintOffer[]>,
  photoHash: string,
): PrintOffer[] {
  return [...(preMintOffers[photoHash.toLowerCase()] ?? [])].sort(
    (a, b) => b.amountKub - a.amountKub,
  )
}

export function highestPreMintOfferOf(
  preMintOffers: Record<string, PrintOffer[]>,
  photoHash: string,
): PrintOffer | null {
  return getPreMintOffers(preMintOffers, photoHash)[0] ?? null
}

export function makePreMintOffer(input: {
  photoHash: string
  bidder: string
  amountKub: number
  durationHours?: number
}): { ok: true; offer: PrintOffer } | { ok: false; minRequired: number } {
  hydrateOnce()
  const key = input.photoHash.toLowerCase()
  const top = highestPreMintOfferOf(state.preMintOffers, key)
  const minReq = minimumNextOfferKub(top?.amountKub)
  if (!Number.isFinite(input.amountKub) || input.amountKub < minReq) {
    return { ok: false, minRequired: minReq }
  }

  const now = Date.now()
  const offer: PrintOffer = {
    id: `pmo-${now}`,
    bidder: input.bidder,
    bidderHandle: handleForAddress(input.bidder),
    amountKub: Number(input.amountKub.toFixed(2)),
    createdAt: now,
    expiresAt: now + (input.durationHours ?? 72) * 3600_000,
    txHash: genTxHash(),
  }

  const existing = state.preMintOffers[key] ?? []
  state = {
    ...state,
    preMintOffers: {
      ...state.preMintOffers,
      [key]: [offer, ...existing.filter((o) => o.bidder.toLowerCase() !== input.bidder.toLowerCase())],
    },
  }
  persist()
  emit()
  syncDbMutation({ type: 'print.preMintOffer', photoHash: key, offer })
  return { ok: true, offer }
}

export function cancelPreMintOffer(input: {
  photoHash: string
  offerId: string
  bidder: string
}) {
  hydrateOnce()
  const key = input.photoHash.toLowerCase()
  const existing = state.preMintOffers[key] ?? []
  state = {
    ...state,
    preMintOffers: {
      ...state.preMintOffers,
      [key]: existing.filter(
        (o) => !(o.id === input.offerId && o.bidder.toLowerCase() === input.bidder.toLowerCase()),
      ),
    },
  }
  persist()
  emit()
  syncDbMutation({
    type: 'print.preMintCancel',
    photoHash: key,
    offerId: input.offerId,
    bidder: input.bidder,
  })
}

export function acceptPreMintOffer(input: {
  postId: string
  photoHash: string
  rollId: number
  frame: number
  filmId: number
  photographer: string
  offerId: string
}): PrintEdition | null {
  hydrateOnce()
  const key = input.photoHash.toLowerCase()
  const offers = state.preMintOffers[key] ?? []
  const offer = offers.find((o) => o.id === input.offerId)
  if (!offer) return null

  const existing = getPrintForPost(state.prints, input.postId, key)
  if (existing) return existing

  const now = Date.now()
  const nextTokenId = state.prints.reduce((max, p) => Math.max(max, p.tokenId), 0) + 1
  const txHash = genTxHash()

  const created: PrintEdition = {
    tokenId: nextTokenId,
    postId: input.postId,
    photoHash: input.photoHash,
    rollId: input.rollId,
    frame: input.frame,
    filmId: input.filmId,
    photographer: input.photographer,
    owner: offer.bidder,
    ownerHandle: offer.bidderHandle,
    askPriceKub: null,
    royaltyBps: ROYALTY_BPS,
    protocolFeeBps: PROTOCOL_FEE_BPS,
    mintedAt: now,
    mintTxHash: txHash,
    lastSaleKub: offer.amountKub,
    offers: [],
    history: [
      {
        id: `ev-${now}-acc`,
        kind: 'offer_accepted',
        actor: offer.bidder,
        actorHandle: offer.bidderHandle,
        amountKub: offer.amountKub,
        txHash,
        timestamp: now,
      },
      {
        id: `ev-${now}-mint`,
        kind: 'minted',
        actor: input.photographer,
        actorHandle: handleForAddress(input.photographer),
        amountKub: offer.amountKub,
        txHash,
        timestamp: now,
      },
    ],
  }

  const nextPreMint = { ...state.preMintOffers }
  delete nextPreMint[key]

  state = {
    prints: [created, ...state.prints],
    preMintOffers: nextPreMint,
  }
  persist()
  emit()
  syncPrintToDb(created)
  syncDbMutation({ type: 'print.preMintClear', photoHash: key })
  return created
}
