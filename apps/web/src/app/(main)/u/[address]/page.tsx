import { UserProfileView } from '@/features/feed'

export async function generateMetadata({ params }: PageProps<'/u/[address]'>) {
  const { address } = await params
  const short =
    address.length <= 11 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`
  return { title: short }
}

export default async function UserProfilePage({ params }: PageProps<'/u/[address]'>) {
  const { address } = await params
  return <UserProfileView profileAddress={address} />
}
