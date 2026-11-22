import { Button, EmptyState } from '@chainroll/ui'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'

export const metadata = { title: 'ฟีด' }

// The real feed needs the server (posts, likes) in M4. Until then, say so plainly.
export default async function FeedPage() {
  const t = await getTranslations('feed')
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-16 md:px-8">
      <header className="mb-8 flex flex-col gap-1.5">
        <span className="font-mono text-2xs tracking-wide text-frame">▸ {t('eyebrow')}</span>
        <h1 className="font-display text-3xl leading-none md:text-4xl">{t('title')}</h1>
      </header>
      <EmptyState
        mark="00"
        title={t('soonTitle')}
        description={t('soonBody')}
        action={
          <Button variant="primary" asChild>
            <Link href="/camera">{t('cta')}</Link>
          </Button>
        }
      />
    </div>
  )
}
