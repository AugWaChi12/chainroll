import { getRequestConfig } from 'next-intl/server'

// Single locale for now (th). Switch to cookie/header-based locale when `en` ships.
export default getRequestConfig(async () => {
  const locale = 'th'
  return {
    locale,
    timeZone: 'Asia/Bangkok',
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
