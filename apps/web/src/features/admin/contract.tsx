'use client'

import {
  activeChain,
  chainRollContract,
  classifyTxError,
  isBusy,
  txReducer,
  useWallet,
  wagmiConfig,
} from '@/features/wallet'
import { chainRollAbi } from '@chainroll/contracts'
import { Badge, Button, Input, KPIGrid, KPIStat, PageHeader, RebateLabel, TxHash } from '@chainroll/ui'
import { Check, Lock, Pause, Play, RefreshCw, ShieldCheck, UserPlus, UserX } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useReducer, useState } from 'react'
import { isAddress, keccak256, stringToHex, zeroAddress, type Address, type Hex } from 'viem'
import { useReadContracts } from 'wagmi'
import { waitForTransactionReceipt, writeContract } from 'wagmi/actions'
import { recordAudit } from './audit-store'

const DEFAULT_ADMIN_ROLE: Hex =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
const CURATOR_ROLE: Hex = keccak256(stringToHex('CURATOR_ROLE'))
const CONFIRM_WORD = 'ChainRoll'

export function AdminContract() {
  const t = useTranslations('admin.contract')
  const { address } = useWallet()

  const [delayMinutes, setDelayMinutes] = useState<string>('60')
  const [routerInput, setRouterInput] = useState<string>('')
  const [roleTarget, setRoleTarget] = useState<string>('')
  const [confirmName, setConfirmName] = useState<string>('')
  const [tx, dispatch] = useReducer(txReducer, { status: 'idle' })

  const state = useReadContracts({
    contracts: [
      {
        address: chainRollContract!,
        abi: chainRollAbi,
        chainId: activeChain.id,
        functionName: 'paused',
      },
      {
        address: chainRollContract!,
        abi: chainRollAbi,
        chainId: activeChain.id,
        functionName: 'nextRollId',
      },
      {
        address: chainRollContract!,
        abi: chainRollAbi,
        chainId: activeChain.id,
        functionName: 'developDelay',
      },
      {
        address: chainRollContract!,
        abi: chainRollAbi,
        chainId: activeChain.id,
        functionName: 'sdkCallHelperRouter',
      },
      {
        address: chainRollContract!,
        abi: chainRollAbi,
        chainId: activeChain.id,
        functionName: 'hasRole',
        args: [DEFAULT_ADMIN_ROLE, address ?? zeroAddress],
      },
      {
        address: chainRollContract!,
        abi: chainRollAbi,
        chainId: activeChain.id,
        functionName: 'hasRole',
        args: [CURATOR_ROLE, address ?? zeroAddress],
      },
    ],
    query: { enabled: Boolean(chainRollContract) },
  })

  const isPaused = Boolean(state.data?.[0]?.result)
  const nextRollId = Number(state.data?.[1]?.result ?? 1n)
  const developDelaySec = Number(state.data?.[2]?.result ?? 3600n)
  const routerAddr = (state.data?.[3]?.result as Address | undefined) ?? zeroAddress
  const isAdmin = Boolean(address && state.data?.[4]?.result)
  const isCurator = Boolean(address && state.data?.[5]?.result)

  const runContractWrite = async (
    actionName: string,
    detail: string,
    call: () => Promise<Hex>,
  ) => {
    if (!address || !chainRollContract) return
    dispatch({ type: 'reset' })
    try {
      dispatch({ type: 'sign' })
      const hash = await call()
      dispatch({ type: 'submitted', hash })
      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash,
        chainId: activeChain.id,
      })
      if (receipt.status !== 'success') throw new Error('transaction reverted')
      dispatch({ type: 'mined', hash })
      recordAudit({
        actor: address,
        category: 'contract',
        action: actionName,
        target: `ChainRoll (${chainRollContract.slice(0, 6)}…${chainRollContract.slice(-4)})`,
        detail,
        txHash: hash,
      })
      await state.refetch()
    } catch (err) {
      dispatch({ type: 'error', ...classifyTxError(err) })
    }
  }

  const updateDelay = () => {
    const contract = chainRollContract
    const account = address
    if (!contract || !account) return
    const sec = Math.max(0, Math.round(Number(delayMinutes) * 60))
    void runContractWrite('contract.set_delay', `developDelay=${sec}s`, () =>
      writeContract(wagmiConfig, {
        address: contract,
        abi: chainRollAbi,
        chainId: activeChain.id,
        account,
        functionName: 'setDevelopDelay',
        args: [BigInt(sec)],
      }),
    )
  }

  const updateRouter = () => {
    const contract = chainRollContract
    const account = address
    if (!contract || !account || !isAddress(routerInput)) return
    void runContractWrite('contract.set_router', `sdkCallHelperRouter=${routerInput}`, () =>
      writeContract(wagmiConfig, {
        address: contract,
        abi: chainRollAbi,
        chainId: activeChain.id,
        account,
        functionName: 'setSdkCallHelperRouter',
        args: [routerInput],
      }),
    )
  }

  const changeCuratorRole = (grant: boolean) => {
    const contract = chainRollContract
    const account = address
    if (!contract || !account || !isAddress(roleTarget)) return
    void runContractWrite(
      grant ? 'contract.grant_curator' : 'contract.revoke_curator',
      `CURATOR_ROLE ${grant ? 'granted to' : 'revoked from'} ${roleTarget}`,
      () =>
        writeContract(wagmiConfig, {
          address: contract,
          abi: chainRollAbi,
          chainId: activeChain.id,
          account,
          functionName: grant ? 'grantRole' : 'revokeRole',
          args: [CURATOR_ROLE, roleTarget],
        }),
    )
  }

  const togglePause = () => {
    const contract = chainRollContract
    const account = address
    if (!contract || !account || confirmName !== CONFIRM_WORD) return
    const nextPause = !isPaused
    setConfirmName('')
    void runContractWrite(
      nextPause ? 'contract.pause' : 'contract.unpause',
      nextPause ? 'Emergency pause triggered' : 'Contract unpaused',
      () =>
        writeContract(wagmiConfig, {
          address: contract,
          abi: chainRollAbi,
          chainId: activeChain.id,
          account,
          functionName: nextPause ? 'pause' : 'unpause',
        }),
    )
  }

  const explorerAddressUrl = activeChain.blockExplorers?.default.url
    ? `${activeChain.blockExplorers.default.url}/address/`
    : undefined
  const explorerTxBaseUrl = activeChain.blockExplorers?.default.url
    ? `${activeChain.blockExplorers.default.url}/tx/`
    : undefined

  return (
    <>
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
        actions={
          <Button variant="ghost" size="sm" onClick={() => void state.refetch()}>
            <RefreshCw />
            {t('refresh')}
          </Button>
        }
      />

      <div className="flex flex-col gap-6 px-4 py-6 md:px-8">
        {/* Live on-chain KPIs */}
        <KPIGrid>
          <KPIStat
            label={t('kpi.status')}
            value={isPaused ? t('status.paused') : t('status.live')}
            hint={`${activeChain.name} (${activeChain.id})`}
            tone={isPaused ? 'danger' : 'default'}
          />
          <KPIStat
            label={t('kpi.totalRolls')}
            value={String(Math.max(0, nextRollId - 1))}
            hint={`nextRollId = ${nextRollId}`}
          />
          <KPIStat
            label={t('kpi.developDelay')}
            value={`${Math.round(developDelaySec / 60)} min`}
            hint={`${developDelaySec}s on-chain`}
          />
          <KPIStat
            label={t('kpi.yourRoles')}
            value={
              !address
                ? t('roles.disconnected')
                : isAdmin
                  ? 'ADMIN + CURATOR'
                  : isCurator
                    ? 'CURATOR'
                    : t('roles.viewer')
            }
            hint={address ? `${address.slice(0, 6)}…${address.slice(-4)}` : t('connectHint')}
          />
        </KPIGrid>

        {/* Contract deployment & Role table */}
        <section className="grid gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-4 border border-border bg-bg-raised p-4 md:p-5 lg:col-span-6">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-frame" />
                <h2 className="text-sm font-semibold">{t('deploymentTitle')}</h2>
              </div>
              <Badge tone={isPaused ? 'danger' : 'success'} dot>
                {isPaused ? t('status.paused') : t('status.live')}
              </Badge>
            </div>

            <dl className="flex flex-col divide-y divide-border text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <dt className="text-fg-muted">{t('fields.address')}</dt>
                <dd>
                  {chainRollContract ? (
                    <TxHash hash={chainRollContract} explorerUrl={explorerAddressUrl} />
                  ) : (
                    <span className="font-mono text-fg-subtle">—</span>
                  )}
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <dt className="text-fg-muted">{t('fields.network')}</dt>
                <dd className="font-mono text-fg">
                  {activeChain.name} · Chain ID {activeChain.id}
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <dt className="text-fg-muted">{t('fields.router')}</dt>
                <dd>
                  <TxHash hash={routerAddr} explorerUrl={explorerAddressUrl} />
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <dt className="text-fg-muted">DEFAULT_ADMIN_ROLE</dt>
                <dd className="flex items-center gap-2">
                  <RebateLabel>0x00…00</RebateLabel>
                  <Badge tone={isAdmin ? 'success' : 'neutral'}>
                    {isAdmin ? t('roles.granted') : t('roles.none')}
                  </Badge>
                </dd>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <dt className="text-fg-muted">CURATOR_ROLE</dt>
                <dd className="flex items-center gap-2">
                  <TxHash hash={CURATOR_ROLE} />
                  <Badge tone={isCurator ? 'success' : 'neutral'}>
                    {isCurator ? t('roles.granted') : t('roles.none')}
                  </Badge>
                </dd>
              </div>
            </dl>

            {tx.status === 'confirmed' && (
              <div className="flex items-center justify-between border border-success/40 bg-bg px-3 py-2 text-xs text-success">
                <span>{t('txConfirmed')}</span>
                <TxHash hash={tx.hash} explorerUrl={explorerTxBaseUrl} />
              </div>
            )}
            {tx.status === 'failed' && (
              <p className="text-xs text-danger">{t(`errors.${tx.code}`)}</p>
            )}
          </div>

          {/* Parameters & Role management */}
          <div className="flex flex-col gap-4 border border-border bg-bg-raised p-4 md:p-5 lg:col-span-6">
            <h2 className="border-b border-border pb-3 text-sm font-semibold">
              {t('paramsTitle')}
            </h2>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label={t('fields.setDelay')}
                  type="number"
                  min={0}
                  max={1440}
                  value={delayMinutes}
                  onChange={(e) => setDelayMinutes(e.target.value)}
                  trailing="min"
                />
              </div>
              <Button
                variant="secondary"
                disabled={!address || !chainRollContract || isBusy(tx)}
                onClick={updateDelay}
              >
                <Check />
                {t('actions.saveDelay')}
              </Button>
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Input
                  label={t('fields.setRouter')}
                  placeholder={routerAddr}
                  value={routerInput}
                  onChange={(e) => setRouterInput(e.target.value)}
                />
              </div>
              <Button
                variant="secondary"
                disabled={!address || !chainRollContract || !isAddress(routerInput) || isBusy(tx)}
                onClick={updateRouter}
              >
                <Check />
                {t('actions.saveRouter')}
              </Button>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <Input
                label={t('fields.curatorTarget')}
                placeholder="0x…"
                value={roleTarget}
                onChange={(e) => setRoleTarget(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!address || !chainRollContract || !isAddress(roleTarget) || isBusy(tx)}
                  onClick={() => changeCuratorRole(true)}
                >
                  <UserPlus />
                  {t('actions.grantCurator')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!address || !chainRollContract || !isAddress(roleTarget) || isBusy(tx)}
                  onClick={() => changeCuratorRole(false)}
                >
                  <UserX />
                  {t('actions.revokeCurator')}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Emergency Pause / Unpause with confirmation typing (§8.6) */}
        <section className="flex flex-col gap-4 border border-danger/40 bg-bg-raised p-4 shadow-[inset_2px_0_0_var(--danger)] md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Lock className="size-4 text-danger" />
                <h2 className="text-sm font-semibold text-fg">{t('pauseZone.title')}</h2>
              </div>
              <p className="text-xs text-fg-muted">{t('pauseZone.body')}</p>
            </div>
            <Badge tone={isPaused ? 'danger' : 'neutral'}>
              {isPaused ? t('status.paused') : t('status.live')}
            </Badge>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-xs">
              <Input
                label={t('pauseZone.confirmLabel', { word: CONFIRM_WORD })}
                placeholder={CONFIRM_WORD}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            </div>
            <Button
              variant={isPaused ? 'primary' : 'danger'}
              disabled={
                !address || !chainRollContract || confirmName !== CONFIRM_WORD || isBusy(tx)
              }
              onClick={togglePause}
            >
              {isPaused ? <Play /> : <Pause />}
              {isPaused ? t('pauseZone.unpauseBtn') : t('pauseZone.pauseBtn')}
            </Button>
          </div>
        </section>
      </div>
    </>
  )
}
