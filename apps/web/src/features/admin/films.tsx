'use client'

import {
  FILM_STOCKS,
  FilmPreview,
  SAMPLE_SCENES,
  parseCubeLut,
  type CubeLutInfo,
  type FilmLook,
  type FilmStock,
  type SampleSceneKind,
} from '@/features/film'
import {
  activeChain,
  chainRollContract,
  classifyTxError,
  isBusy,
  txReducer,
  useWallet,
} from '@/features/wallet'
import { wagmiConfig } from '@/features/wallet'
import { chainRollAbi } from '@chainroll/contracts'
import { Badge, Button, Input, PageHeader, RebateLabel, TxHash, cn } from '@chainroll/ui'
import { Check, Plus, RotateCcw, Sliders, SplitSquareHorizontal, Upload } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useReducer, useRef, useState, type ChangeEvent } from 'react'
import { useReadContracts } from 'wagmi'
import { waitForTransactionReceipt, writeContract } from 'wagmi/actions'
import { recordAudit } from './audit-store'

const EXTRA_STOCK: FilmStock = {
  id: 4,
  name: 'Warm 160',
  code: 'WM 160',
  iso: 160,
  frames: 24,
  swatch: 'linear-gradient(135deg,#f3d19c,#c97a4b 55%,#4b291a)',
  look: {
    exposure: 0.08,
    contrast: 0.28,
    saturation: 1.12,
    fade: 0.06,
    shadowTint: [0.01, 0.01, -0.01],
    highlightTint: [0.06, 0.03, -0.03],
    balance: [1.06, 1.01, 0.92],
    grain: 0.22,
    grainSize: 1.4,
    halation: 0.14,
    halationTint: [1.0, 0.4, 0.18],
    vignette: 0.26,
    monochrome: false,
  },
}

const ALL_STOCKS: readonly FilmStock[] = [...FILM_STOCKS, EXTRA_STOCK]

type SliderKey = 'exposure' | 'contrast' | 'saturation' | 'fade' | 'grain' | 'halation' | 'vignette'

const SLIDERS: readonly {
  key: SliderKey
  min: number
  max: number
  step: number
}[] = [
  { key: 'grain', min: 0, max: 1, step: 0.02 },
  { key: 'halation', min: 0, max: 1, step: 0.02 },
  { key: 'vignette', min: 0, max: 1, step: 0.02 },
  { key: 'contrast', min: 0, max: 1, step: 0.02 },
  { key: 'saturation', min: 0, max: 1.6, step: 0.02 },
  { key: 'exposure', min: -0.5, max: 0.5, step: 0.02 },
  { key: 'fade', min: 0, max: 0.25, step: 0.01 },
]

export function AdminFilms() {
  const t = useTranslations('admin.films')
  const { address } = useWallet()
  const fileRef = useRef<HTMLInputElement>(null)

  const [selectedId, setSelectedId] = useState<number>(1)
  const baseStock = useMemo(
    () => ALL_STOCKS.find((s) => s.id === selectedId) ?? ALL_STOCKS[0]!,
    [selectedId],
  )

  const [name, setName] = useState<string>(baseStock.name)
  const [frames, setFrames] = useState<number>(baseStock.frames)
  const [active, setActive] = useState<boolean>(selectedId <= 3)
  const [look, setLook] = useState<FilmLook>(baseStock.look)
  const [compare, setCompare] = useState<boolean>(true)
  const [splitPos, setSplitPos] = useState<number>(0.5)
  const [lutInfo, setLutInfo] = useState<CubeLutInfo | null>(null)
  const [lutError, setLutError] = useState<string | null>(null)
  const [tx, dispatch] = useReducer(txReducer, { status: 'idle' })

  // Read live on-chain film configs via wagmi
  const onChainFilms = useReadContracts({
    contracts: ALL_STOCKS.map((s) => ({
      address: chainRollContract!,
      abi: chainRollAbi,
      chainId: activeChain.id,
      functionName: 'getFilm' as const,
      args: [s.id] as const,
    })),
    query: { enabled: Boolean(chainRollContract) },
  })

  const selectStock = (stock: FilmStock, onChain?: { name: string; frames: number; active: boolean }) => {
    setSelectedId(stock.id)
    setName(onChain?.name || stock.name)
    setFrames(onChain?.frames || stock.frames)
    setActive(onChain ? onChain.active : stock.id <= 3)
    setLook(stock.look)
    setLutInfo(null)
    setLutError(null)
    dispatch({ type: 'reset' })
  }

  const onLutFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLutError(null)
    try {
      const text = await file.text()
      const parsed = parseCubeLut(text)
      setLutInfo(parsed)
      setLook((prev) => ({ ...prev, ...parsed.look }))
    } catch {
      setLutError(t('lutError'))
    }
  }

  const publishOnChain = async () => {
    if (!chainRollContract || !address) return
    const cleanFrames = Math.min(72, Math.max(1, Math.round(frames)))
    dispatch({ type: 'reset' })
    try {
      dispatch({ type: 'sign' })
      const hash = await writeContract(wagmiConfig, {
        address: chainRollContract,
        abi: chainRollAbi,
        chainId: activeChain.id,
        account: address,
        functionName: 'setFilm',
        args: [selectedId, name.trim() || baseStock.name, cleanFrames, active],
      })
      dispatch({ type: 'submitted', hash })
      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash,
        chainId: activeChain.id,
      })
      if (receipt.status !== 'success') throw new Error('transaction reverted')
      dispatch({ type: 'mined', hash })
      recordAudit({
        actor: address,
        category: 'films',
        action: 'film.publish',
        target: `Film #${selectedId} · ${name.trim() || baseStock.name}`,
        detail: `${cleanFrames} frames · active=${String(active)}${lutInfo ? ` · LUT=${lutInfo.title}` : ''}`,
        txHash: hash,
      })
      await onChainFilms.refetch()
    } catch (err) {
      dispatch({ type: 'error', ...classifyTxError(err) })
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => selectStock(EXTRA_STOCK)}
          >
            <Plus />
            {t('newStock')}
          </Button>
        }
      />

      <div className="flex flex-col gap-6 px-4 py-6 md:px-8">
        {/* Film stock selector cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ALL_STOCKS.map((stock, idx) => {
            const chainData = onChainFilms.data?.[idx]?.result as
              | { name: string; frames: number; active: boolean }
              | undefined
            const isRegistered = Boolean(chainData && chainData.frames > 0)
            const isActive = isRegistered ? chainData!.active : stock.id <= 3
            const isSelected = stock.id === selectedId

            return (
              <button
                key={stock.id}
                type="button"
                onClick={() => selectStock(stock, isRegistered ? chainData : undefined)}
                className={cn(
                  'flex flex-col gap-3 border p-3.5 text-left transition-colors duration-[var(--dur-fast)]',
                  isSelected
                    ? 'border-border-strong bg-bg-sunken shadow-[inset_0_2px_0_var(--accent)]'
                    : 'border-border bg-bg-raised hover:bg-bg-sunken/50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-2xs text-frame">
                    ▸ #{stock.id} · {stock.code}
                  </span>
                  <Badge tone={isActive ? 'success' : 'neutral'} dot>
                    {isActive ? t('status.active') : t('status.inactive')}
                  </Badge>
                </div>
                <div className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="size-6 shrink-0 rounded-xs border border-border-strong"
                    style={{ background: stock.swatch }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-lg leading-tight text-fg">
                      {chainData?.name || stock.name}
                    </p>
                    <p className="font-mono text-2xs text-fg-muted">
                      ISO {stock.iso} · {chainData?.frames || stock.frames} EXP
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Editor + 4-scene live WebGL2 preview */}
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left: Shader & LUT controls + On-chain settings */}
          <div className="flex flex-col gap-5 border border-border bg-bg-raised p-4 md:p-5 lg:col-span-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="size-4 text-frame" />
                <h2 className="text-sm font-semibold">{t('editorTitle', { id: selectedId })}</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLook(baseStock.look)
                  setLutInfo(null)
                }}
              >
                <RotateCcw />
                {t('resetLook')}
              </Button>
            </div>

            {/* .cube LUT upload */}
            <div className="flex flex-col gap-2 border border-border bg-bg p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-xs font-medium text-fg">{t('lutTitle')}</span>
                  <span className="text-2xs text-fg-muted">
                    {lutInfo
                      ? `${lutInfo.title} · ${lutInfo.size}³ (${lutInfo.points} pts)`
                      : t('lutHint')}
                  </span>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".cube,text/plain"
                  className="hidden"
                  onChange={onLutFile}
                />
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload />
                  {t('uploadLut')}
                </Button>
              </div>
              {lutError && <p className="text-xs text-danger">{lutError}</p>}
            </div>

            {/* Shader sliders */}
            <div className="flex flex-col gap-3">
              {SLIDERS.map(({ key, min, max, step }) => (
                <label key={key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-fg-muted">{t(`sliders.${key}`)}</span>
                    <span className="font-mono tabular text-fg">{look[key].toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={look[key]}
                    onChange={(e) =>
                      setLook((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                    }
                    className="h-1.5 w-full cursor-pointer accent-[var(--accent)]"
                  />
                </label>
              ))}

              <label className="mt-1 flex cursor-pointer items-center justify-between border-t border-border pt-3 text-xs">
                <span className="text-fg-muted">{t('sliders.monochrome')}</span>
                <input
                  type="checkbox"
                  checked={look.monochrome}
                  onChange={(e) =>
                    setLook((prev) => ({
                      ...prev,
                      monochrome: e.target.checked,
                      saturation: e.target.checked ? 0 : baseStock.look.saturation || 1,
                    }))
                  }
                  className="size-4 accent-[var(--accent)]"
                />
              </label>
            </div>

            {/* On-chain metadata & Publish */}
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <span className="font-mono text-2xs uppercase tracking-wide text-frame">
                ▸ {t('onChainSection')}
              </span>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={t('fields.name')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Input
                  label={t('fields.frames')}
                  type="number"
                  min={1}
                  max={72}
                  value={String(frames)}
                  onChange={(e) => setFrames(Number(e.target.value) || 24)}
                />
              </div>

              <label className="flex cursor-pointer items-center justify-between border border-border bg-bg px-3 py-2 text-xs">
                <span className="font-medium text-fg">{t('fields.active')}</span>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
              </label>

              <div className="flex flex-col gap-2">
                <Button
                  variant="primary"
                  disabled={!address || !chainRollContract || isBusy(tx)}
                  onClick={publishOnChain}
                >
                  <Check />
                  {isBusy(tx) ? t('publishing') : t('publish')}
                </Button>
                {!address && <p className="text-2xs text-fg-muted">{t('connectHint')}</p>}
                {tx.status === 'confirmed' && (
                  <div className="flex items-center justify-between border border-success/40 bg-bg px-3 py-2 text-xs text-success">
                    <span>{t('publishedOk')}</span>
                    <TxHash
                      hash={tx.hash}
                      explorerUrl={
                        activeChain.blockExplorers?.default.url
                          ? `${activeChain.blockExplorers.default.url}/tx/`
                          : undefined
                      }
                    />
                  </div>
                )}
                {tx.status === 'failed' && (
                  <p className="text-xs text-danger">{t(`errors.${tx.code}`)}</p>
                )}
              </div>
            </div>
          </div>

          {/* Right: 4-scene live WebGL2 preview grid with Before/After split (§8.3) */}
          <div className="flex flex-col gap-4 border border-border bg-bg-raised p-4 md:p-5 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold">{t('previewTitle')}</h2>
                <p className="text-xs text-fg-muted">{t('previewSubtitle')}</p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant={compare ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setCompare((c) => !c)}
                >
                  <SplitSquareHorizontal />
                  {t('beforeAfter')}
                </Button>
                {compare && (
                  <input
                    type="range"
                    min={0.05}
                    max={0.95}
                    step={0.05}
                    value={splitPos}
                    aria-label={t('beforeAfter')}
                    onChange={(e) => setSplitPos(Number(e.target.value))}
                    className="h-1.5 w-24 cursor-pointer accent-[var(--frame)]"
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {SAMPLE_SCENES.map((scene: SampleSceneKind, i) => (
                <div key={scene} className="flex flex-col gap-1.5 bg-[#0e0c0b] p-2.5">
                  <div className="relative">
                    <FilmPreview
                      look={look}
                      scene={scene}
                      split={compare ? splitPos : undefined}
                      className="aspect-[2/3] w-full"
                    />
                    {compare && (
                      <div className="pointer-events-none absolute top-2 right-2 left-2 flex justify-between font-mono text-[10px] uppercase tracking-wider">
                        <span className="bg-black/70 px-1.5 py-0.5 text-white/80">
                          {t('rawTag')}
                        </span>
                        <span className="bg-black/70 px-1.5 py-0.5 text-frame">{name}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between font-mono text-2xs text-frame">
                    <span>
                      ▸ 0{i + 1}A · {t(`scenes.${scene}`)}
                    </span>
                    <RebateLabel className="border-white/15 bg-transparent text-frame/80">
                      {baseStock.code}
                    </RebateLabel>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
