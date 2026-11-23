import { ActivityView } from '@/features/roll'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('meta.pages')
  return { title: t('activity') }
}

export default function ActivityPage() {
  return <ActivityView />
}
