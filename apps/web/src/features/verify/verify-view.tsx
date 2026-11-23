'use client'

import { useFeedStore } from '@/features/feed'
import { activeChain } from '@/features/wallet'
import { Badge, Button, Input, RebateLabel, TxHash, cn, truncateHash } from '@chainroll/ui'
import {
  CheckCircle2,
  ExternalLink,
  FileSearch,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react'
import type { Route } from 'next'
import { useFormatter, useTranslations } from 'next-intl'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { keccak256 } from 'viem'

type VerifyApiResult =
  | {
      ok: true
      verified: true
      source: 'post' | 'shot'
      photoHash: string
      postId: string | null
      rollId: number
      frame: number
      filmId: number
      filmName: string
      shooter: string
      shooterHandle: string | null
      txHash: string | null
      caption: string | null
      imageUrl: string | null
      createdAt: number
      print: {
        tokenId: number
        owner: string
        ownerHandle: string | null
        askPriceKub: number | null
      } | null
    }
  | {
      ok: true
      verified: false
      photoHash: string
    }

function frameMark(frame: number): string {
  return `${String(frame).padStart(2, '0')}${frame % 2 ? 'A' : ''}`
}

export function VerifyView({ initialHash }: { initialHash?: string }) {
  const t = useTranslations('verify')
  const format = useFormatter()
  const { posts } = useFeedStore()

  const [hashInput, setHashInput] = useState(initialHash ?? '')
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<VerifyApiResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const verifyHash = useCallback(
    async (raw: string) => {
      const clean = raw.trim()
      if (!/^0x[a-fA-F0-9]{64}$/.test(clean)) {
        setError(t('errors.invalidHash'))
        setResult(null)
        return
      }
      setError(null)
      setChecking(true)
      try {
        const res = await fetch(`/api/verify?hash=${encodeURIComponent(clean)}`, {
          cache: 'no-store',
        })
        const data = (await res.json()) as VerifyApiResult & { error?: string }
        if (!res.ok || !data.ok) {
          setError(data.error ?? t('errors.failed'))
          setResult(null)
        } else {
          setResult(data)
        }
      } catch {
        setError(t('errors.failed'))
        setResult(null)
      } finally {
        setChecking(false)
      }
    },
    [t],
  )

  useEffect(() => {
    if (!initialHash || !/^0x[a-fA-F0-9]{64}$/.test(initialHash)) return
    const controller = new AbortController()
    void fetch(`/api/verify?hash=${encodeURIComponent(initialHash)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((res) => res.json() as Promise<VerifyApiResult & { error?: string }>)
      .then((data) => {
        if (data.ok) {
          setResult(data)
          setError(null)
        } else {
          setError(data.error ?? t('errors.failed'))
        }
      })
      .catch(() => {})
    return () => controller.abort()
  }, [initialHash, t])

  const handleFile = async (file: File) => {
    setFileName(file.name)
    setError(null)
    setChecking(true)
    try {
      const buf = await file.arrayBuffer()
      const digest = keccak256(new Uint8Array(buf))
      setHashInput(digest)
      await verifyHash(digest)
    } catch {
      setError(t('errors.failed'))
      setChecking(false)
    }
  }

  const samplePosts = posts.slice(0, 3)
  const explorerBase = activeChain.blockExplorers?.default.url ?? 'https://testnet.kubscan.com'

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 pb-20 md:px-8 md:pt-10">
      <header className="mb-8 flex flex-col gap-2 border-b border-border pb-6">
        <span className="font-mono text-2xs tracking-wide text-frame">▸ {t('eyebrow')}</span>
        <h1 className="font-display text-3xl leading-none md:text-4xl">{t('title')}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-fg-muted">{t('subtitle')}</p>
      </header>

      {/* Drag & drop file hashing zone (100% local in browser) */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) void handleFile(file)
        }}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        className={cn(
          'mb-6 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-sm border-2 border-dashed px-6 py-10 text-center transition-colors',
          dragging
            ? 'border-frame bg-frame/10'
            : 'border-border-strong bg-bg-raised hover:border-frame/70 hover:bg-bg-sunken/50',
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void handleFile(file)
            e.target.value = ''
          }}
        />
        <div className="grid size-12 place-items-center rounded-full border border-border bg-bg text-frame">
          {checking ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-fg">
            {fileName ? t('fileSelected', { name: fileName }) : t('dropTitle')}
          </p>
          <p className="text-xs text-fg-muted">{t('dropHint')}</p>
        </div>
      </div>

      {/* Direct keccak256 hash lookup */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setFileName(null)
          void verifyHash(hashInput)
        }}
        className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <Input
            label={t('hashLabel')}
            placeholder="0x…"
            value={hashInput}
            onChange={(e) => setHashInput(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <Button type="submit" variant="primary" disabled={checking || !hashInput.trim()}>
          {checking ? <Loader2 className="animate-spin" /> : <FileSearch />}
          {t('checkBtn')}
        </Button>
      </form>

      {/* Quick sample frames from live feed */}
      {samplePosts.length > 0 && (
        <div className="mb-8 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
          <span className="font-mono text-2xs text-fg-subtle">{t('trySample')}</span>
          {samplePosts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setFileName(null)
                setHashInput(p.photoHash)
                void verifyHash(p.photoHash)
              }}
              className="rounded-xs border border-border bg-bg-raised px-2 py-0.5 font-mono text-2xs text-fg-muted transition-colors hover:border-frame hover:text-fg"
            >
              ▸ {frameMark(p.frame)} · {p.handle ?? truncateHash(p.shooter)}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-6 border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </div>
      )}

      {/* Verification Certificate Result */}
      {result && result.verified && (
        <section
          aria-live="polite"
          className="flex flex-col gap-5 border border-success/50 bg-bg-raised p-5 shadow-[inset_3px_0_0_var(--success)] md:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="size-6 shrink-0 text-success" />
              <div className="flex flex-col">
                <span className="font-mono text-2xs tracking-wide text-success">
                  ▸ {t('result.verifiedBadge')}
                </span>
                <h2 className="font-display text-xl text-fg">{t('result.verifiedTitle')}</h2>
              </div>
            </div>
            <Badge tone="success" dot>
              {activeChain.name}
            </Badge>
          </div>

          <div className="grid gap-5 md:grid-cols-12">
            {result.imageUrl && (
              <div className="bg-[#0e0c0b] p-2 md:col-span-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.imageUrl}
                  alt={result.caption ?? result.photoHash}
                  className="aspect-[2/3] w-full object-cover"
                />
                <div className="mt-1.5 flex items-center justify-between font-mono text-2xs text-frame">
                  <span>▸ {frameMark(result.frame)}</span>
                  <span>{result.filmName}</span>
                </div>
              </div>
            )}

            <div className={cn('flex flex-col gap-4', result.imageUrl ? 'md:col-span-8' : 'md:col-span-12')}>
              {result.caption && (
                <p className="border-l-2 border-frame pl-3 text-sm leading-relaxed text-fg">
                  “{result.caption}”
                </p>
              )}

              <dl className="grid grid-cols-1 gap-3 border border-border bg-bg p-3.5 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-2xs text-fg-subtle">{t('fields.shooter')}</dt>
                  <dd className="mt-0.5 font-medium text-fg">
                    <Link href={`/u/${result.shooter}` as Route} className="hover:underline">
                      {result.shooterHandle ? `@${result.shooterHandle}` : truncateHash(result.shooter)}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs text-fg-subtle">{t('fields.rollFrame')}</dt>
                  <dd className="mt-0.5 font-mono text-fg">
                    <RebateLabel>
                      ROLL #{result.rollId} · {frameMark(result.frame)} · {result.filmName}
                    </RebateLabel>
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs text-fg-subtle">{t('fields.timestamp')}</dt>
                  <dd className="mt-0.5 font-mono text-fg">
                    {format.dateTime(new Date(result.createdAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-2xs text-fg-subtle">{t('fields.photoHash')}</dt>
                  <dd className="mt-0.5">
                    <TxHash hash={result.photoHash} />
                  </dd>
                </div>
                {result.txHash && (
                  <div className="sm:col-span-2">
                    <dt className="text-2xs text-fg-subtle">{t('fields.txHash')}</dt>
                    <dd className="mt-0.5">
                      <TxHash
                        hash={result.txHash}
                        explorerUrl={`${explorerBase}/tx/`}
                      />
                    </dd>
                  </div>
                )}
              </dl>

              {result.print && (
                <div className="flex flex-wrap items-center justify-between gap-2 border border-frame/40 bg-frame/10 px-3.5 py-2.5 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-mono text-frame">
                    <Sparkles className="size-3.5" />
                    1/1 PRINT #{String(result.print.tokenId).padStart(2, '0')}
                    {result.print.askPriceKub ? ` · ${result.print.askPriceKub.toFixed(1)} KUB` : ''}
                  </span>
                  <span className="font-mono text-2xs text-fg-muted">
                    {t('fields.owner')}:{' '}
                    {result.print.ownerHandle
                      ? `@${result.print.ownerHandle}`
                      : truncateHash(result.print.owner)}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {result.postId && (
                  <Button variant="primary" size="sm" asChild>
                    <Link href={`/p/${result.postId}` as Route}>
                      <ShieldCheck />
                      {t('result.viewPost')}
                    </Link>
                  </Button>
                )}
                {result.txHash && (
                  <Button variant="secondary" size="sm" asChild>
                    <a
                      href={`${explorerBase}/tx/${result.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink />
                      {t('result.viewExplorer')}
                    </a>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {result && !result.verified && (
        <section
          aria-live="polite"
          className="flex flex-col gap-3 border border-danger/50 bg-bg-raised p-5 shadow-[inset_3px_0_0_var(--danger)]"
        >
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="size-6 shrink-0 text-danger" />
            <div className="flex flex-col">
              <span className="font-mono text-2xs tracking-wide text-danger">
                ▸ {t('result.unverifiedBadge')}
              </span>
              <h2 className="font-display text-xl text-fg">{t('result.unverifiedTitle')}</h2>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-fg-muted">{t('result.unverifiedBody')}</p>
          <div className="flex items-center gap-2 border border-border bg-bg px-3 py-2 font-mono text-2xs text-fg-subtle">
            <span>keccak256:</span>
            <TxHash hash={result.photoHash} />
          </div>
        </section>
      )}
    </div>
  )
}
