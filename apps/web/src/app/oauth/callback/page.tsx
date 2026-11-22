'use client'

import { getBitkubSdk } from '@/features/wallet'
import { Button, FilmStrip } from '@chainroll/ui'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

/** Bitkub NEXT redirects here with ?code=… after login (PROJECT_BRIEF §5.1). */
function Callback() {
  const t = useTranslations('oauth')
  const params = useSearchParams()
  const router = useRouter()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const code = params.get('code')
    if (!code) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- invalid callback URL
      setFailed(true)
      return
    }
    void getBitkubSdk()
      .then((sdk) => sdk.exchangeAuthorizationCode(code))
      .then(() => {
        // opened as a popup by loginWithBitkubNext → close it; otherwise go back to the camera
        if (window.opener) window.close()
        else router.replace('/camera')
      })
      .catch(() => setFailed(true))
  }, [params, router])

  return (
    <div data-mode="analog" className="grid min-h-dvh place-items-center bg-bg p-6 text-fg">
      {failed ? (
        <div className="flex flex-col items-start gap-3">
          <p className="font-display text-2xl">{t('failed')}</p>
          <Button asChild>
            <Link href="/camera">{t('back')}</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <FilmStrip label={t('working')} />
          <p className="text-sm text-fg-muted">{t('working')}</p>
        </div>
      )}
    </div>
  )
}

export default function OAuthCallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  )
}
