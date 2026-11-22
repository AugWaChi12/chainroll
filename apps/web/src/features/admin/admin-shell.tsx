'use client'

import { AppShell, Badge, type NavSection } from '@deekub/ui'
import {
  Aperture,
  FileClock,
  Film,
  Flag,
  Fuel,
  LayoutDashboard,
  ScrollText,
  Users,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'
import type { ReactNode } from 'react'

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations('admin')
  const pathname = usePathname()
  const item = (
    href: string,
    key: string,
    icon: NavSection['items'][number]['icon'],
    count?: number,
  ) => ({
    href,
    label: t(`nav.${key}`),
    icon,
    count,
    active: href === '/admin' ? pathname === '/admin' : pathname.startsWith(href),
  })

  const sections: NavSection[] = [
    {
      title: t('nav.monitor'),
      items: [
        item('/admin', 'overview', LayoutDashboard),
        item('/admin/moderation', 'moderation', Flag, 7),
      ],
    },
    {
      title: t('nav.content'),
      items: [item('/admin/films', 'films', Film), item('/admin/users', 'users', Users)],
    },
    {
      title: t('nav.system'),
      items: [
        item('/admin/gas', 'gas', Fuel),
        item('/admin/contract', 'contract', ScrollText),
        item('/admin/audit', 'audit', FileClock),
      ],
    },
  ]

  return (
    <AppShell
      brand={
        <Link href="/" className="flex items-center gap-2">
          <Aperture className="size-4 text-accent" aria-hidden />
          <span className="text-sm font-semibold tracking-tight">{t('console')}</span>
        </Link>
      }
      sections={sections}
      renderLink={({ href, children, ...rest }) => (
        <Link href={href as Route} {...rest}>
          {children}
        </Link>
      )}
      onSearch={() => {
        /* Command palette lands in M5 */
      }}
      searchLabel={t('search')}
      topbarRight={
        <>
          <Badge tone="warning" dot>
            testnet
          </Badge>
          <span className="font-mono text-xs text-fg-muted">0x9a3…e21f</span>
        </>
      }
      sidebarFooter={<span className="font-mono text-2xs text-fg-subtle">v0.1 · M1</span>}
    >
      {children}
    </AppShell>
  )
}
