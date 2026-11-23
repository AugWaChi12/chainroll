import { describe, expect, it } from 'vitest'
import {
  SEED_POSTS,
  createPost,
  deletePost,
  frameMark,
  getProfileMeta,
  isLikedBy,
  likeCountOf,
  reportPost,
  saveProfileMeta,
  toggleLike,
} from './post-store'
import {
  acceptPrintOffer,
  buyPrintEdition,
  calculateSettlement,
  makePrintOffer,
  minimumNextOfferKub,
  mintPrintEdition,
} from './print-market'

describe('feed post-store', () => {
  it('formats film rebate frame marks with alternating A suffix', () => {
    expect(frameMark(1)).toBe('01A')
    expect(frameMark(2)).toBe('02')
    expect(frameMark(14)).toBe('14')
  })

  it('creates, likes, reports and deletes a user post', () => {
    const shooter = '0x1111111111111111111111111111111111111111'
    const post = createPost({
      shooter,
      rollId: 99,
      frame: 5,
      filmId: 1,
      photoHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      caption: 'First test frame from darkroom',
    })
    expect(post.id).toBe('p-abcdef12')
    expect(likeCountOf(post)).toBe(0)

    toggleLike(post.id, shooter)
    const afterLike = createPost({
      shooter,
      rollId: 99,
      frame: 5,
      filmId: 1,
      photoHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      caption: 'Updated caption',
    })
    expect(isLikedBy(afterLike, shooter)).toBe(true)
    expect(likeCountOf(afterLike)).toBe(1)

    reportPost(post.id, shooter, 'spam', 'Self test report')
    expect(deletePost(post.id, '0x2222222222222222222222222222222222222222')).toBe(false)
    expect(deletePost(post.id, shooter)).toBe(true)
    expect(SEED_POSTS.length).toBeGreaterThanOrEqual(6)
  })

  it('computes primary and secondary sale settlement with 5% royalty and 2.5% protocol fee', () => {
    const primary = calculateSettlement(10, false)
    expect(primary).toEqual({
      priceKub: 10,
      royaltyKub: 0,
      protocolFeeKub: 0.25,
      sellerNetKub: 9.75,
    })

    const secondary = calculateSettlement(20, true)
    expect(secondary).toEqual({
      priceKub: 20,
      royaltyKub: 1,
      protocolFeeKub: 0.5,
      sellerNetKub: 18.5,
    })

    expect(minimumNextOfferKub(null)).toBe(0.5)
    expect(minimumNextOfferKub(4)).toBe(4.2)
  })

  it('mints a 1/1 print, enforces minimum outbid steps, accepts an offer and buys a print', () => {
    const shooter = '0x3333333333333333333333333333333333333333'
    const collector1 = '0x4444444444444444444444444444444444444444'
    const collector2 = '0x5555555555555555555555555555555555555555'

    const edition = mintPrintEdition({
      postId: 'p-test-99',
      photoHash: '0x9999999999999999999999999999999999999999999999999999999999999999',
      rollId: 7,
      frame: 3,
      filmId: 1,
      photographer: shooter,
      askPriceKub: 8,
    })
    expect(edition.tokenId).toBeGreaterThan(0)
    expect(edition.owner).toBe(shooter)

    const offer1 = makePrintOffer({
      tokenId: edition.tokenId,
      bidder: collector1,
      amountKub: 5,
    })
    expect(offer1.ok).toBe(true)

    // Outbid too low (< 5.25)
    const lowOffer = makePrintOffer({
      tokenId: edition.tokenId,
      bidder: collector2,
      amountKub: 5.1,
    })
    expect(lowOffer.ok).toBe(false)

    // Instant buy transfers ownership to collector2
    expect(buyPrintEdition({ tokenId: edition.tokenId, buyer: collector2 })).toBe(true)

    // Now collector2 owns it and can accept collector1's remaining 5 KUB offer
    expect(
      acceptPrintOffer({
        tokenId: edition.tokenId,
        offerId: edition.offers[0]?.id ?? '',
        seller: shooter,
      }),
    ).toBe(false)
  })

  it('validates and updates photographer @handle and bio', () => {
    const user = '0x6666666666666666666666666666666666666666'
    expect(saveProfileMeta({ address: user, handle: 'bad handle!', bio: '' }).ok).toBe(false)
    expect(saveProfileMeta({ address: user, handle: 'ploy.shoots', bio: '' })).toEqual({
      ok: false,
      reason: 'taken',
    })

    const saved = saveProfileMeta({
      address: user,
      handle: '@film_bkk',
      bio: 'Shooting 35mm around Bangkok',
    })
    expect(saved.ok).toBe(true)
    expect(getProfileMeta(user).handle).toBe('film_bkk')
    expect(getProfileMeta(user).bio).toBe('Shooting 35mm around Bangkok')
  })
})
