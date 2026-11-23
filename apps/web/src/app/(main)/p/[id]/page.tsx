import { PostDetailView } from '@/features/feed'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('meta.pages')
  return { title: t('feed') }
}

export default async function PostDetailPage({ params }: PageProps<'/p/[id]'>) {
  const { id } = await params
  return <PostDetailView postId={id} />
}
