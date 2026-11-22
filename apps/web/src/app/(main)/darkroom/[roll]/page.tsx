import { RollSheet } from '@/features/darkroom'
import { notFound } from 'next/navigation'

export const metadata = { title: 'ห้องมืด' }

export default async function RollPage({ params }: PageProps<'/darkroom/[roll]'>) {
  const { roll } = await params
  if (!/^\d{1,12}$/.test(roll) || roll === '0') notFound()
  return <RollSheet rollId={BigInt(roll)} />
}
