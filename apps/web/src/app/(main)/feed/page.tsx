import { FeedView } from '@/features/feed'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('meta.pages')
  return { title: t('feed') }
}

export default function FeedPage() {
  return <FeedView />
}
