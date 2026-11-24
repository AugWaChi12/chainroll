import { LeaderboardView } from '@/features/leaderboard'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('meta.pages')
  return { title: t('leaderboard') }
}

export default function LeaderboardPage() {
  return <LeaderboardView />
}
