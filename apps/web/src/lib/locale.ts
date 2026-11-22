export const LOCALES = ['th', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'th'
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale)

/**
 * Pick a locale from an Accept-Language header. Thai audience first: anything that mentions Thai
 * gets `th`; English-only browsers get `en`; everything else falls back to Thai.
 */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE
  const langs = header
    .split(',')
    .map((p) => p.split(';')[0]!.trim().toLowerCase())
    .filter(Boolean)
  if (langs.some((l) => l.startsWith('th'))) return 'th'
  if (langs[0]?.startsWith('en')) return 'en'
  return DEFAULT_LOCALE
}
