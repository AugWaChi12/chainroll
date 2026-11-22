import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans_Thai,
  Instrument_Serif,
  Noto_Serif_Thai,
} from 'next/font/google'
import type { ReactNode } from 'react'
import { WalletProvider } from '@/features/wallet'
import './globals.css'

const display = Instrument_Serif({ subsets: ['latin'], weight: '400', variable: '--ff-display' })
const displayTh = Noto_Serif_Thai({
  subsets: ['thai'],
  weight: ['400', '500'],
  variable: '--ff-display-th',
})
const sans = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--ff-sans',
})
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--ff-mono' })

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    title: { default: t('title'), template: '%s · ChainRoll' },
    description: t('description'),
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2ede4' },
    { media: '(prefers-color-scheme: dark)', color: '#0e0c0b' },
  ],
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()
  return (
    <html
      lang={locale}
      className={`${display.variable} ${displayTh.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <WalletProvider>{children}</WalletProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
