/* eslint-disable @next/next/no-img-element */
import { fetchPostByIdFromDb, type PostOgSummary } from '@/server/db'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'
export const alt = 'ChainRoll — 1/1 Analog Film Frame on KUB Chain'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const STOCK_SPEC: Record<number, string> = {
  1: 'KUB 400 · ISO 400',
  2: 'BW 400 · ISO 400',
  3: 'NIGHT 800 · ISO 800',
}

function shortHex(hex: string): string {
  return hex.length > 12 ? `${hex.slice(0, 6)}…${hex.slice(-4)}` : hex
}

function frameMark(frame: number): string {
  return `${String(frame).padStart(2, '0')}${frame % 2 ? 'A' : ''}`
}

type LoadedOgFont = {
  name: string
  data: ArrayBuffer
  style: 'normal'
  weight: 600
}

let ogFontsPromise: Promise<LoadedOgFont[]> | null = null

function isValidOpenTypeBuffer(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false
  const v = new Uint8Array(buf, 0, 4)
  // TrueType (00 01 00 00), OpenType CFF (OTTO), or WOFF (wOFF)
  const isTtf = v[0] === 0x00 && v[1] === 0x01 && v[2] === 0x00 && v[3] === 0x00
  const isOtf = v[0] === 0x4f && v[1] === 0x54 && v[2] === 0x54 && v[3] === 0x4f
  const isWoff = v[0] === 0x77 && v[1] === 0x4f && v[2] === 0x46 && v[3] === 0x46
  return isTtf || isOtf || isWoff
}

async function fetchValidFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    return isValidOpenTypeBuffer(buf) ? buf : null
  } catch {
    return null
  }
}

function loadOgFonts(): Promise<LoadedOgFont[]> {
  if (!ogFontsPromise) {
    ogFontsPromise = (async () => {
      const [thai, latin] = await Promise.all([
        fetchValidFont(
          'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-thai@latest/thai-600-normal.ttf',
        ),
        fetchValidFont(
          'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-thai@latest/latin-600-normal.ttf',
        ),
      ])
      const fonts: LoadedOgFont[] = []
      if (latin) fonts.push({ name: 'Noto Sans Latin', data: latin, style: 'normal', weight: 600 })
      if (thai) fonts.push({ name: 'Noto Sans Thai', data: thai, style: 'normal', weight: 600 })
      return fonts
    })()
  }
  return ogFontsPromise
}

async function loadLocalSampleDataUrl(scene: PostOgSummary['scene']): Promise<string | null> {
  const candidates = [
    path.join(process.cwd(), 'public', 'samples', `${scene}.jpg`),
    path.join(process.cwd(), 'apps', 'web', 'public', 'samples', `${scene}.jpg`),
  ]
  for (const p of candidates) {
    try {
      const buf = await readFile(/* turbopackIgnore: true */ p)
      return `data:image/jpeg;base64,${buf.toString('base64')}`
    } catch {
      /* try next candidate path */
    }
  }
  return null
}

async function resolvePhotoDataUrl(
  imageUrl: string | null,
  scene: PostOgSummary['scene'],
): Promise<string | null> {
  if (imageUrl) {
    if (imageUrl.startsWith('data:image/jpeg;base64,') || imageUrl.startsWith('data:image/png;base64,')) {
      return imageUrl
    }
    if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
      try {
        const res = await fetch(imageUrl, { signal: AbortSignal.timeout(4000) })
        if (res.ok) {
          const ct = (res.headers.get('content-type') || '').toLowerCase()
          if (ct.includes('image/jpeg') || ct.includes('image/png')) {
            const arr = await res.arrayBuffer()
            if (arr.byteLength > 0 && arr.byteLength <= 3_500_000) {
              const mime = ct.includes('image/png') ? 'image/png' : 'image/jpeg'
              return `data:${mime};base64,${Buffer.from(arr).toString('base64')}`
            }
          }
        }
      } catch {
        /* fallback to local sample image */
      }
    }
  }
  return loadLocalSampleDataUrl(scene)
}

function buildStatusLine(post: PostOgSummary | null): string {
  if (!post) return '1/1 ANALOG PRINT · KUB CHAIN'
  if (post.print) {
    const num = String(post.print.tokenId).padStart(2, '0')
    if (post.print.askPriceKub) {
      return `1/1 PRINT #${num} · ${post.print.askPriceKub.toFixed(1)} KUB`
    }
    if (post.print.topOfferKub) {
      return `1/1 PRINT #${num} · TOP OFFER ${post.print.topOfferKub.toFixed(1)} KUB`
    }
    return `1/1 PRINT #${num} · KUB CHAIN`
  }
  if (post.topPreMintOfferKub) {
    return `PRE-MINT OFFER · ${post.topPreMintOfferKub.toFixed(1)} KUB`
  }
  return 'VERIFIED ON-CHAIN · KUB CHAIN'
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let post: PostOgSummary | null = null
  try {
    post = await fetchPostByIdFromDb(id)
  } catch {
    /* fallback to default card if DB unavailable */
  }

  const [photoSrc, ogFonts] = await Promise.all([
    resolvePhotoDataUrl(post?.imageUrl ?? null, post?.scene ?? 'nature'),
    loadOgFonts(),
  ])

  const mark = post ? frameMark(post.frame) : '01A'
  const stock = post ? (STOCK_SPEC[post.filmId] ?? `FILM #${post.filmId}`) : 'KUB 400 · ISO 400'
  const handle = post
    ? post.handle
      ? `@${post.handle}`
      : shortHex(post.shooter)
    : 'ChainRoll Photographer'
  const rawCaption = post?.caption?.trim() || `Verified 35mm analog film frame (${id}) on KUB Chain`
  const caption = rawCaption.length > 96 ? `${rawCaption.slice(0, 95)}…` : rawCaption
  const statusLine = buildStatusLine(post)
  const hashLabel = post ? shortHex(post.photoHash) : id.toUpperCase()
  const rollMeta = post ? `ROLL #${post.rollId} · FRAME ${mark}` : `FRAME ${mark}`
  const siteHost = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chainroll.nan-tai.com').replace(
    /^https?:\/\//,
    '',
  )

  const sprockets = [0, 1, 2, 3, 4, 5, 6, 7]

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: '#0E0C0B',
          color: '#F2EDE4',
          padding: '40px 52px',
          fontFamily: ogFonts.length > 0 ? '"Noto Sans Latin", "Noto Sans Thai", sans-serif' : 'sans-serif',
          justifyContent: 'space-between',
          borderTop: '8px solid #D23A1E',
        }}
      >
        {/* Left: Real 35mm Analog Film Frame */}
        <div
          style={{
            width: '406px',
            height: '540px',
            backgroundColor: '#151210',
            border: '2px solid #2A2622',
            padding: '14px 16px 20px 16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          {/* Top 35mm film sprocket strip */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              paddingLeft: '6px',
              paddingRight: '6px',
              marginBottom: '10px',
            }}
          >
            {sprockets.map((n) => (
              <div
                key={n}
                style={{
                  width: '24px',
                  height: '14px',
                  borderRadius: '3px',
                  backgroundColor: '#0A0807',
                  border: '1px solid #2E2924',
                }}
              />
            ))}
          </div>

          {/* Photo viewport */}
          <div
            style={{
              width: '100%',
              height: '430px',
              backgroundColor: '#1E1A17',
              position: 'relative',
              display: 'flex',
              overflow: 'hidden',
              border: '1px solid #2A2622',
            }}
          >
            {photoSrc ? (
              <img
                src={photoSrc}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: 'linear-gradient(165deg, #2b4d7e 0%, #c9876a 55%, #f3c27a 100%)',
                }}
              />
            )}
          </div>

          {/* Film rebate footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#E8A33D',
              fontSize: '14px',
              letterSpacing: '0.16em',
              marginTop: '12px',
            }}
          >
            <span>{`${mark} · CHAINROLL`}</span>
            <span>{stock}</span>
          </div>
        </div>

        {/* Right: Editorial Details & On-Chain Proof */}
        <div
          style={{
            flex: 1,
            marginLeft: '48px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            paddingTop: '10px',
            paddingBottom: '10px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: '#E8A33D',
                fontSize: '17px',
                letterSpacing: '0.14em',
              }}
            >
              <div
                style={{
                  width: '8px',
                  height: '8px',
                  backgroundColor: '#E8A33D',
                }}
              />
              <span>{statusLine}</span>
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: '48px',
                fontWeight: 600,
                color: '#F2EDE4',
                marginTop: '16px',
                lineHeight: 1.1,
              }}
            >
              {handle}
            </div>

            <div
              style={{
                display: 'flex',
                fontSize: '26px',
                color: '#C5BCB1',
                marginTop: '22px',
                lineHeight: 1.45,
              }}
            >
              {`"${caption}"`}
            </div>
          </div>

          {/* On-chain proof pill + Brand footer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: '#161311',
                border: '1px solid #2A2622',
                padding: '14px 18px',
                fontSize: '15px',
                color: '#A39A90',
                letterSpacing: '0.08em',
              }}
            >
              <span>{rollMeta}</span>
              <span style={{ color: '#E8A33D' }}>{`HASH ${hashLabel}`}</span>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid #2A2622',
                paddingTop: '20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '999px',
                    backgroundColor: '#D23A1E',
                  }}
                />
                <span style={{ fontSize: '24px', fontWeight: 700, color: '#F2EDE4' }}>
                  {siteHost}
                </span>
              </div>
              <span
                style={{
                  fontSize: '15px',
                  color: '#E8A33D',
                  letterSpacing: '0.12em',
                }}
              >
                1 SHOT = 1 TX · KUB CHAIN
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: ogFonts.length > 0 ? ogFonts : undefined,
    },
  )
}
