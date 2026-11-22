import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { Anuphan, Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { UiLabelsBridge } from '@/features/i18n'
import { WalletProvider } from '@/features/wallet'
import './globals.css'

// Modern pairing: Bricolage Grotesque (display) · Geist (UI) · Geist Mono (numbers, film rebates)
// Thai text falls through to Anuphan — a loopless contemporary Thai face that sits well with grotesks.
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--ff-display' })
const sans = Geist({ subsets: ['latin'], variable: '--ff-sans' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--ff-mono' })
const thai = Anuphan({ subsets: ['thai', 'latin'], variable: '--ff-thai' })

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
      className={`${display.variable} ${sans.variable} ${mono.variable} ${thai.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <UiLabelsBridge>
            <WalletProvider>{children}</WalletProvider>
          </UiLabelsBridge>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
