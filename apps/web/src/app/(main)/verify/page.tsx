import { VerifyView } from '@/features/verify'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('verify')
  return {
    title: t('title'),
    description: t('subtitle'),
  }
}

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ hash?: string }>
}) {
  const sp = await searchParams
  return <VerifyView initialHash={sp.hash} />
}
