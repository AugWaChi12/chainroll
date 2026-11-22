import { getTranslations } from 'next-intl/server'

export const metadata = { title: 'ความเป็นส่วนตัว' }

export default async function PrivacyPage() {
  const t = await getTranslations('privacyPage')
  const sections = t.raw('sections') as { h: string; p: string }[]
  return (
    <article className="mx-auto max-w-2xl px-4 pt-10 pb-20 md:px-8">
      <span className="font-mono text-2xs tracking-wide text-frame">▸ {t('eyebrow')}</span>
      <h1 className="mt-1.5 font-display text-4xl leading-none">{t('title')}</h1>
      <p className="mt-4 border-l-2 border-warning bg-bg-raised px-4 py-2 text-sm text-fg-muted">
        {t('draft')}
      </p>
      <div className="mt-10 flex flex-col gap-8">
        {sections.map((s, i) => (
          <section key={s.h}>
            <h2 className="flex items-baseline gap-3 text-lg font-medium">
              <span className="font-mono text-2xs text-frame">
                {String(i + 1).padStart(2, '0')}
              </span>
              {s.h}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-fg-muted">{s.p}</p>
          </section>
        ))}
      </div>
    </article>
  )
}
