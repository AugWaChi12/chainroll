'use client'

import { UiLabelsProvider, type UiLabels } from '@chainroll/ui'
import { useMessages } from 'next-intl'
import type { ReactNode } from 'react'

/** Feeds the design system's own strings (aria labels, defaults) from the active locale. */
export function UiLabelsBridge({ children }: { children: ReactNode }) {
  const messages = useMessages() as { ui?: Partial<UiLabels> }
  return <UiLabelsProvider labels={messages.ui ?? {}}>{children}</UiLabelsProvider>
}
