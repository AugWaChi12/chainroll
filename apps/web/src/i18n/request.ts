import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { LOCALE_COOKIE, isLocale, localeFromAcceptLanguage } from '@/lib/locale'

// No locale in the URL: the choice lives in a cookie (set by the TH/EN switcher),
// falling back to the browser's Accept-Language.
export default getRequestConfig(async () => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale = isLocale(fromCookie)
    ? fromCookie
    : localeFromAcceptLanguage((await headers()).get('accept-language'))
  return {
    locale,
    timeZone: 'Asia/Bangkok',
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
