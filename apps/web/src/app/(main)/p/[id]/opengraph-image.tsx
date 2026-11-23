import { ImageResponse } from 'next/og'

export const alt = 'ChainRoll — 1/1 Analog Film Frame on KUB Chain'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const SEED_META: Record<
  string,
  { frame: string; stock: string; handle: string; caption: string; price: string }
> = {
  'p-101': {
    frame: '07A',
    stock: 'KUB 400 · ISO 400',
    handle: '@ploy.shoots',
    caption: 'Last ferry light on the Chao Phraya river',
    price: '1/1 PRINT #01 · 4.50 KUB',
  },
  'p-102': {
    frame: '19A',
    stock: 'BW 400 · ISO 400',
    handle: '@bank_35mm',
    caption: 'Hard noon shadows on Charoenkrung shophouses',
    price: 'VERIFIED ON-CHAIN · KUB 96',
  },
  'p-103': {
    frame: '23A',
    stock: 'NT 800 · ISO 800',
    handle: '@oat.charoenkrung',
    caption: 'Yaowarat neon after the rain · 800 handles every alley',
    price: '1/1 PRINT #02 · TOP OFFER 7.50 KUB',
  },
  'p-104': {
    frame: '04',
    stock: 'KUB 400 · ISO 400',
    handle: '@nong.film',
    caption: 'First coffee by the wooden window table',
    price: 'VERIFIED ON-CHAIN · KUB 96',
  },
  'p-105': {
    frame: '24',
    stock: 'NT 800 · ISO 800',
    handle: '@ploy.shoots',
    caption: 'Final frame of the roll at Hua Lamphong station',
    price: '1/1 PRINT #03 · 5.20 KUB',
  },
  'p-106': {
    frame: '12',
    stock: 'BW 400 · ISO 400',
    handle: '@tee.k',
    caption: 'Heavy grain black & white — worth the one-hour develop wait',
    price: 'VERIFIED ON-CHAIN · KUB 96',
  },
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const info = SEED_META[id] ?? {
    frame: '01A',
    stock: 'KUB 400 · ISO 400',
    handle: 'ChainRoll Photographer',
    caption: `Verified 35mm analog film frame (${id}) on KUB Chain`,
    price: '1/1 ANALOG PRINT · KUB CHAIN',
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: '#0E0C0B',
          color: '#F2EDE4',
          padding: '44px 56px',
          fontFamily: 'sans-serif',
          justifyContent: 'space-between',
          borderTop: '8px solid #D23A1E',
        }}
      >
        {/* Left: Analog Frame Preview Card */}
        <div
          style={{
            width: '390px',
            height: '530px',
            backgroundColor: '#161311',
            border: '2px solid #2A2622',
            padding: '18px 18px 34px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              width: '100%',
              height: '445px',
              background: 'linear-gradient(165deg, #2b4d7e 0%, #c9876a 55%, #f3c27a 100%)',
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              padding: '20px',
            }}
          >
            <div
              style={{
                backgroundColor: 'rgba(14, 12, 11, 0.82)',
                color: '#E8A33D',
                padding: '6px 12px',
                fontSize: '16px',
                letterSpacing: '0.16em',
              }}
            >
              ▸ {info.frame}
            </div>
            <div
              style={{
                backgroundColor: 'rgba(14, 12, 11, 0.82)',
                color: '#F2EDE4',
                padding: '6px 12px',
                fontSize: '15px',
              }}
            >
              {info.stock}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              color: '#E8A33D',
              fontSize: '14px',
              letterSpacing: '0.2em',
              marginTop: '10px',
            }}
          >
            <span>▸ {info.frame} · CHAINROLL</span>
            <span>{id.toUpperCase()}</span>
          </div>
        </div>

        {/* Right: Editorial Details & 1/1 Print Badge */}
        <div
          style={{
            flex: 1,
            marginLeft: '54px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            paddingTop: '12px',
            paddingBottom: '12px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                color: '#E8A33D',
                fontSize: '18px',
                letterSpacing: '0.15em',
              }}
            >
              <span>▸ {info.price}</span>
            </div>

            <div
              style={{
                fontSize: '54px',
                fontWeight: 700,
                color: '#F2EDE4',
                marginTop: '18px',
                lineHeight: 1.08,
              }}
            >
              {info.handle}
            </div>

            <div
              style={{
                fontSize: '26px',
                color: '#A39A90',
                marginTop: '22px',
                lineHeight: 1.4,
              }}
            >
              “{info.caption}”
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              borderTop: '1px solid #2A2622',
              paddingTop: '24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '999px',
                    backgroundColor: '#D23A1E',
                  }}
                />
                <span style={{ fontSize: '30px', fontWeight: 700, color: '#F2EDE4' }}>
                  chainroll.art
                </span>
              </div>
              <span
                style={{
                  fontSize: '16px',
                  color: '#E8A33D',
                  letterSpacing: '0.14em',
                }}
              >
                1 SHOT = 1 TX · KUB CHAIN
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
