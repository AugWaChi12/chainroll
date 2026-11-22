'use client'

import { useTranslations } from 'next-intl'

/** Localized display name of a film stock (on-chain names stay as deployed). */
export function useStockName() {
  const t = useTranslations('films.stocks')
  return (id: number) => t(`${id}.name` as never)
}
