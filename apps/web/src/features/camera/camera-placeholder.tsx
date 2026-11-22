import { FrameCounter, RebateLabel } from '@deekub/ui'
import { ArrowLeft } from 'lucide-react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'

/** Analog-mode shell for the camera. Real viewfinder + WebGL film pipeline lands in M2. */
export function CameraPlaceholder() {
  const t = useTranslations('camera')
  return (
    <div data-mode="analog" className="grain flex min-h-dvh flex-col bg-bg text-fg">
      <header className="flex h-14 items-center justify-between px-4">
        <Link href="/" aria-label="กลับ" className="rounded-xs p-2 text-fg-muted hover:text-fg">
          <ArrowLeft className="size-5" />
        </Link>
        <RebateLabel>KUB 400 · 24 EXP</RebateLabel>
        <FrameCounter used={0} total={24} />
      </header>

      {/* viewfinder */}
      <div className="relative mx-4 flex flex-1 items-center justify-center border border-border">
        {[
          'top-3 left-3 border-t border-l',
          'top-3 right-3 border-t border-r',
          'bottom-3 left-3 border-b border-l',
          'bottom-3 right-3 border-b border-r',
        ].map((c) => (
          <span key={c} aria-hidden className={`absolute size-5 border-frame/70 ${c}`} />
        ))}
        <div className="flex max-w-xs flex-col items-center gap-2 text-center">
          <p className="font-display text-2xl">{t('placeholder')}</p>
          <p className="text-sm text-fg-muted">{t('placeholderBody')}</p>
        </div>
      </div>

      {/* controls */}
      <div className="flex h-36 items-center justify-center">
        <button
          type="button"
          disabled
          aria-label={t('shutter')}
          className="grid size-20 place-items-center rounded-full border-2 border-fg/80 disabled:opacity-50"
        >
          <span className="size-16 rounded-full bg-fg" />
        </button>
      </div>
    </div>
  )
}
