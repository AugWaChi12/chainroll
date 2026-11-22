import { getTranslations } from 'next-intl/server'
import { FilmsCatalog } from '@/features/film'

export async function generateMetadata() {
  const t = await getTranslations('meta.pages')
  return { title: t('films') }
}

export default function FilmsPage() {
  return <FilmsCatalog />
}
