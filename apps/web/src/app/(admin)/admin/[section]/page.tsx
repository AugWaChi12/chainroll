import { ADMIN_SECTIONS, type AdminSection } from '@/features/admin'
import { EmptyState, PageHeader } from '@chainroll/ui'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

export function generateStaticParams() {
  return ADMIN_SECTIONS.map((section) => ({ section }))
}

export default async function AdminSectionPage({ params }: PageProps<'/admin/[section]'>) {
  const { section } = await params
  if (!ADMIN_SECTIONS.includes(section as AdminSection)) notFound()
  const t = await getTranslations('admin')
  const index = String(ADMIN_SECTIONS.indexOf(section as AdminSection) + 2).padStart(2, '0')

  return (
    <>
      <PageHeader
        eyebrow={`${index} · ${t(`nav.${section as AdminSection}`)}`}
        title={t(`nav.${section as AdminSection}`)}
      />
      <div className="px-4 py-6 md:px-8">
        <EmptyState mark={index} title={t('soon.title')} description={t('soon.body')} />
      </div>
    </>
  )
}
