import { PostDetailView } from '@/features/feed'
import { fetchPostByIdFromDb } from '@/server/db'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

const STOCK_LABELS: Record<number, string> = {
  1: 'KUB 400',
  2: 'BW 400',
  3: 'Night 800',
}

function shortAddr(addr: string): string {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

function frameLabel(frame: number): string {
  return `${String(frame).padStart(2, '0')}${frame % 2 ? 'A' : ''}`
}

export async function generateMetadata({ params }: PageProps<'/p/[id]'>): Promise<Metadata> {
  const { id } = await params
  const t = await getTranslations('meta.pages')

  try {
    const post = await fetchPostByIdFromDb(id)
    if (post) {
      const author = post.handle ? `@${post.handle}` : shortAddr(post.shooter)
      const stock = STOCK_LABELS[post.filmId] ?? `Film #${post.filmId}`
      const mark = frameLabel(post.frame)
      const title = `${author} · Frame ${mark} · ${stock}`
      const captionTrimmed = post.caption.trim()
      const proofSuffix = `Verified 35mm analog frame on KUB Chain (${shortAddr(post.photoHash)})`
      const description = captionTrimmed
        ? `“${captionTrimmed.slice(0, 120)}” — ${proofSuffix}`
        : proofSuffix

      return {
        title,
        description,
        openGraph: {
          title: `${title} · ChainRoll`,
          description,
          type: 'article',
          url: `/p/${post.id}`,
        },
        twitter: {
          card: 'summary_large_image',
          title: `${title} · ChainRoll`,
          description,
        },
      }
    }
  } catch {
    /* fallback to generic metadata if DB unavailable */
  }

  return { title: t('feed') }
}

export default async function PostDetailPage({ params }: PageProps<'/p/[id]'>) {
  const { id } = await params
  return <PostDetailView postId={id} />
}
