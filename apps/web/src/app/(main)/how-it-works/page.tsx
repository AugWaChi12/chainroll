import { chainRollAddress, chainRollPrintsAddress } from '@chainroll/contracts'
import { kubTestnet } from '@chainroll/shared'
import { Button, RebateLabel, TxHash } from '@chainroll/ui'
import { Aperture, ShieldCheck } from 'lucide-react'
import { getFormatter, getTranslations } from 'next-intl/server'
import Link from 'next/link'

export async function generateMetadata() {
  const t = await getTranslations('meta.pages')
  return { title: t('how') }
}

/** Gas measured by `forge test --gas-report` (packages/contracts). */
const GAS = { claim: 79_000, shoot: 55_000, develop: 30_000 } as const
const MIN_GWEI = 25 // KUB Whitepaper V5.2: dynamic, minimum 25 Gwei

export default async function HowItWorksPage() {
  const t = await getTranslations('how')
  const f = await getFormatter()
  const steps = t.raw('steps') as { title: string; body: string; tx: string }[]
  const pillars = t.raw('pillars') as { tag: string; title: string; body: string }[]
  const privacy = t.raw('privacy') as string[]
  const faq = t.raw('faq') as { q: string; a: string }[]
  const explorerBase = `${kubTestnet.blockExplorers.default.url}/address/`
  const contracts = [
    { name: 'ChainRoll.sol', address: chainRollAddress[25925] },
    { name: 'ChainRollPrints.sol', address: chainRollPrintsAddress[25925] },
  ] as const
  const rows = [
    ['claim', GAS.claim],
    ['shoot', GAS.shoot],
    ['develop', GAS.develop],
    ['roll', GAS.claim + 24 * GAS.shoot + GAS.develop],
  ] as const
  const kub = (gas: number) => (gas * MIN_GWEI) / 1e9

  return (
    <div className="mx-auto max-w-4xl px-4 pt-10 pb-20 md:px-8">
      <header className="mb-12 flex flex-col gap-1.5">
        <span className="font-mono text-2xs tracking-wide text-frame">▸ {t('eyebrow')}</span>
        <h1 className="font-display text-4xl leading-none md:text-5xl">{t('title')}</h1>
        <p className="max-w-2xl text-md text-fg-muted">{t('subtitle')}</p>
      </header>

      {/* steps as a strip of four frames */}
      <ol className="grid gap-px border border-border bg-border md:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col gap-2 bg-bg-raised p-5">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-2xs tracking-[0.18em] text-frame">▸ 0{i + 1}</span>
              <span className="font-mono text-2xs text-fg-subtle">{s.tx}</span>
            </div>
            <h2 className="font-display text-2xl">{s.title}</h2>
            <p className="text-sm text-fg-muted">{s.body}</p>
          </li>
        ))}
      </ol>

      {/* Architecture & key capabilities */}
      <section className="mt-16">
        <h2 className="mb-5 font-display text-2xl">{t('pillarsTitle')}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {pillars.map((p) => (
            <div
              key={p.tag}
              className="flex flex-col gap-2 border border-border bg-bg-raised p-5"
            >
              <span className="font-mono text-2xs tracking-[0.16em] text-frame">▸ {p.tag}</span>
              <h3 className="font-display text-xl leading-snug">{p.title}</h3>
              <p className="text-sm leading-relaxed text-fg-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Live Smart Contracts */}
      <section className="mt-16 grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="font-display text-2xl">{t('contractsTitle')}</h2>
          <p className="mt-2 text-sm text-fg-muted">{t('contractsBody')}</p>
        </div>
        <div className="flex flex-col divide-y divide-border border border-border bg-bg-raised">
          {contracts.map((c) => (
            <div key={c.name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <span className="font-mono text-xs font-medium text-fg">{c.name}</span>
              {c.address && <TxHash hash={c.address} explorerUrl={explorerBase} />}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="font-display text-2xl">{t('costTitle')}</h2>
          <p className="mt-2 text-sm text-fg-muted">{t('costBody')}</p>
        </div>
        <table className="w-full border border-border text-sm">
          <thead>
            <tr className="border-b border-border text-left text-2xs uppercase tracking-wide text-fg-subtle">
              <th className="px-3 py-2 font-medium">{t('costCols.action')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('costCols.gas')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('costCols.kub')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, gas]) => (
              <tr
                key={k}
                className={k === 'roll' ? 'bg-bg-raised font-medium' : 'border-b border-border'}
              >
                <td className="px-3 py-2">{t(`costRows.${k}`)}</td>
                <td className="px-3 py-2 text-right font-mono tabular">≈ {f.number(gas)}</td>
                <td className="px-3 py-2 text-right font-mono tabular">
                  ≈ {f.number(kub(gas), { maximumSignificantDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-16 grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <h2 className="font-display text-2xl">{t('privacyTitle')}</h2>
        <ul className="flex flex-col gap-3">
          {privacy.map((p) => (
            <li key={p} className="flex gap-3 text-sm">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-frame" aria-hidden />
              <span className="text-fg-muted">{p}</span>
            </li>
          ))}
          <li>
            <Link
              href="/privacy"
              className="text-sm underline decoration-border-strong underline-offset-4 hover:decoration-fg"
            >
              {t('privacyLink')} →
            </Link>
          </li>
        </ul>
      </section>

      <section className="mt-16 grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <h2 className="font-display text-2xl">{t('walletsTitle')}</h2>
        <p className="text-sm text-fg-muted">{t('wallets')}</p>
      </section>

      <section className="mt-16">
        <h2 className="mb-4 font-display text-2xl">{t('faqTitle')}</h2>
        <div className="border-t border-border">
          {faq.map((q) => (
            <details key={q.q} className="group border-b border-border py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-md">
                {q.q}
                <span
                  aria-hidden
                  className="font-mono text-frame transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-2 max-w-2xl text-sm text-fg-muted">{q.a}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border border-border bg-bg-raised p-6">
        <RebateLabel>KUB · 24 EXP · 2 ROLLS/DAY</RebateLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="lg" asChild>
            <Link href="/verify">
              <ShieldCheck />
              {t('verifyLink')}
            </Link>
          </Button>
          <Button variant="primary" size="lg" asChild>
            <Link href="/camera">
              <Aperture />
              {t('cta')}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
