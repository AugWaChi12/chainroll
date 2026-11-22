'use client'

import { Menu, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react'
import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { useUiLabels } from '../i18n'
import { Kbd } from './feedback'

export type NavItem = {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  /** e.g. open reports count */
  count?: number
  active?: boolean
}

export type NavSection = { title?: string; items: NavItem[] }

export type LinkRenderer = (props: {
  href: string
  className: string
  children: ReactNode
  'aria-current'?: 'page'
  onClick?: () => void
}) => ReactNode

const defaultLink: LinkRenderer = ({ children, ...props }) => <a {...props}>{children}</a>

export type AppShellProps = {
  brand: ReactNode
  sections: NavSection[]
  /** Pass Next.js <Link> here — ui stays framework-free */
  renderLink?: LinkRenderer
  topbarRight?: ReactNode
  onSearch?: () => void
  searchLabel?: string
  sidebarFooter?: ReactNode
  children: ReactNode
}

/**
 * Studio-mode shell for admin & dashboards (§8, §9.0).
 * Narrow collapsible sidebar with a film-rebate edge, topbar with ⌘K search.
 */
export function AppShell({
  brand,
  sections,
  renderLink = defaultLink,
  topbarRight,
  onSearch,
  searchLabel,
  sidebarFooter,
  children,
}: AppShellProps) {
  const L = useUiLabels()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!onSearch) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSearch])

  const nav = (
    <nav aria-label={L.mainMenu} className="flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-4">
      {sections.map((section, si) => (
        <div key={si} className="flex flex-col gap-0.5">
          {section.title && !collapsed && (
            <span className="px-2 pb-1.5 font-mono text-2xs uppercase tracking-wide text-fg-subtle">
              {section.title}
            </span>
          )}
          {section.items.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.href}>
                {renderLink({
                  href: item.href,
                  'aria-current': item.active ? 'page' : undefined,
                  onClick: () => setMobileOpen(false),
                  className: cn(
                    'group relative flex h-8 items-center gap-2.5 rounded-xs px-2 text-sm transition-colors duration-[var(--dur-fast)]',
                    item.active
                      ? 'bg-bg-sunken text-fg'
                      : 'text-fg-muted hover:bg-bg-sunken/70 hover:text-fg',
                    collapsed && 'justify-center px-0',
                  ),
                  children: (
                    <>
                      {item.active && (
                        <span
                          aria-hidden
                          className="absolute top-1.5 bottom-1.5 -left-2 w-0.5 bg-accent"
                        />
                      )}
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && item.count !== undefined && item.count > 0 && (
                        <span className="font-mono text-2xs tabular text-frame">{item.count}</span>
                      )}
                      {collapsed && <span className="sr-only">{item.label}</span>}
                    </>
                  ),
                })}
              </div>
            )
          })}
        </div>
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-dvh bg-bg text-fg">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-bg-raised transition-[width,transform] duration-[var(--dur-base)] ease-out',
          'lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0',
          collapsed ? 'lg:w-14' : 'lg:w-60',
          mobileOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full',
        )}
      >
        {/* film rebate edge */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-1"
          style={{
            backgroundImage:
              'repeating-linear-gradient(180deg, var(--frame) 0 10px, transparent 10px 22px)',
            opacity: 0.35,
          }}
        />
        <div
          className={cn(
            'flex h-14 items-center border-b border-border px-4',
            collapsed && 'lg:justify-center lg:px-0',
          )}
        >
          <div className={cn('flex-1', collapsed && 'lg:hidden')}>{brand}</div>
          <button
            type="button"
            className="rounded-xs p-1.5 text-fg-muted hover:bg-bg-sunken hover:text-fg lg:hidden"
            aria-label={L.closeMenu}
            onClick={() => setMobileOpen(false)}
          >
            <X className="size-4" />
          </button>
          <button
            type="button"
            className="hidden rounded-xs p-1.5 text-fg-muted hover:bg-bg-sunken hover:text-fg lg:block"
            aria-label={collapsed ? L.expandMenu : L.collapseMenu}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        </div>
        {nav}
        {sidebarFooter && !collapsed && (
          <div className="border-t border-border p-3">{sidebarFooter}</div>
        )}
      </aside>
      {mobileOpen && (
        <div
          aria-hidden
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-bg/90 px-4 backdrop-blur-sm md:px-6">
          <button
            type="button"
            className="-ml-1.5 rounded-xs p-1.5 text-fg-muted hover:bg-bg-sunken hover:text-fg lg:hidden"
            aria-label={L.openMenu}
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-4" />
          </button>
          {onSearch && (
            <button
              type="button"
              onClick={onSearch}
              className="flex h-8 w-full max-w-80 items-center gap-2 rounded-sm border border-border px-2.5 text-sm text-fg-subtle hover:border-border-strong hover:text-fg-muted"
            >
              <Search className="size-4" aria-hidden />
              <span className="flex-1 text-left">{searchLabel ?? L.searchAll}</span>
              <span className="hidden gap-0.5 sm:flex">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">{topbarRight}</div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}

export type PageHeaderProps = {
  title: string
  /** Small film-rebate label above the title, e.g. "01 · Overview" */
  eyebrow?: string
  description?: string
  actions?: ReactNode
  children?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn('flex flex-col gap-4 border-b border-border px-4 pt-8 pb-5 md:px-8', className)}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          {eyebrow && (
            <span className="font-mono text-2xs uppercase tracking-wide text-frame">
              ▸ {eyebrow}
            </span>
          )}
          <h1 className="font-display text-2xl leading-none text-fg md:text-3xl">{title}</h1>
          {description && <p className="max-w-2xl text-sm text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
