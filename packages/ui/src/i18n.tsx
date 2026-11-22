'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Strings the design system renders itself (aria labels, defaults). English by default;
 * the app passes translations once via <UiLabelsProvider>. `{name}` placeholders are filled by `fmt`.
 */
export const defaultUiLabels = {
  loading: 'Loading',
  retry: 'Try again',
  copyHash: 'Copy hash',
  copied: 'Copied',
  viewOnExplorer: 'View on explorer',
  framesShot: '{used} of {total} frames shot',
  framesLeft: '{left} left',
  latentFrame: 'Frame {frame} — not developed yet',
  mainMenu: 'Main menu',
  openMenu: 'Open menu',
  closeMenu: 'Close menu',
  expandMenu: 'Expand menu',
  collapseMenu: 'Collapse menu',
  searchAll: 'Search everything',
  search: 'Search…',
  noData: 'No data',
  noMatch: 'Nothing matches "{query}"',
  noMatchHint: 'Try another search or clear the filter',
  selectAll: 'Select all',
  selectRow: 'Select row',
  selected: '{count} selected',
  cancel: 'Cancel',
  prevPage: 'Previous page',
  nextPage: 'Next page',
}

export type UiLabels = typeof defaultUiLabels

const Ctx = createContext<UiLabels>(defaultUiLabels)

export function UiLabelsProvider({
  labels,
  children,
}: {
  labels: Partial<UiLabels>
  children: ReactNode
}) {
  return <Ctx.Provider value={{ ...defaultUiLabels, ...labels }}>{children}</Ctx.Provider>
}

export const useUiLabels = () => useContext(Ctx)

export function fmt(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`))
}
