import {
  ADMIN_SECTIONS,
  AdminAudit,
  AdminContract,
  AdminFilms,
  AdminGas,
  AdminModeration,
  AdminUsers,
  type AdminSection,
} from '@/features/admin'
import { notFound } from 'next/navigation'

export function generateStaticParams() {
  return ADMIN_SECTIONS.map((section) => ({ section }))
}

export default async function AdminSectionPage({ params }: PageProps<'/admin/[section]'>) {
  const { section } = await params
  if (!ADMIN_SECTIONS.includes(section as AdminSection)) notFound()

  switch (section as AdminSection) {
    case 'moderation':
      return <AdminModeration />
    case 'films':
      return <AdminFilms />
    case 'users':
      return <AdminUsers />
    case 'gas':
      return <AdminGas />
    case 'contract':
      return <AdminContract />
    case 'audit':
      return <AdminAudit />
  }
}
