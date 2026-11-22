import { getTranslations } from 'next-intl/server'
import { CameraView } from '@/features/camera'

export async function generateMetadata() {
  const t = await getTranslations('meta.pages')
  return { title: t('camera') }
}

export default function CameraPage() {
  return <CameraView />
}
