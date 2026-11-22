import { getTranslations } from 'next-intl/server'
import { DarkroomList } from '@/features/darkroom'

export async function generateMetadata() {
  const t = await getTranslations('meta.pages')
  return { title: t('darkroom') }
}

export default function DarkroomPage() {
  return <DarkroomList />
}
