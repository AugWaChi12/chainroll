/**
 * One state machine for every transaction (PROJECT_BRIEF §9.4).
 * idle → awaiting-signature → [awaiting-approval (Bitkub NEXT)] → pending → confirmed | failed
 */

export type TxErrorCode =
  | 'rejected' // user said no in the wallet
  | 'insufficient-funds'
  | 'wrong-network'
  | 'no-wallet'
  | 'quota' // Bitkub NEXT free-tx quota exhausted
  | 'timeout'
  | 'reverted' // contract revert; `reason` holds the custom error name
  | 'unknown'

export type TxState =
  | { status: 'idle' }
  | { status: 'awaiting-signature' }
  | { status: 'awaiting-approval'; approvalUrl: string }
  | { status: 'pending'; hash: `0x${string}` }
  | { status: 'confirmed'; hash: `0x${string}` }
  | { status: 'failed'; code: TxErrorCode; reason?: string; hash?: `0x${string}` }

export type TxEvent =
  | { type: 'sign' }
  | { type: 'approval'; approvalUrl: string }
  | { type: 'submitted'; hash: `0x${string}` }
  | { type: 'mined'; hash: `0x${string}` }
  | { type: 'error'; code: TxErrorCode; reason?: string }
  | { type: 'reset' }

export function txReducer(state: TxState, event: TxEvent): TxState {
  switch (event.type) {
    case 'reset':
      return { status: 'idle' }
    case 'sign':
      return state.status === 'idle' || state.status === 'failed'
        ? { status: 'awaiting-signature' }
        : state
    case 'approval':
      return state.status === 'awaiting-signature'
        ? { status: 'awaiting-approval', approvalUrl: event.approvalUrl }
        : state
    case 'submitted':
      return state.status === 'awaiting-signature' || state.status === 'awaiting-approval'
        ? { status: 'pending', hash: event.hash }
        : state
    case 'mined':
      return state.status === 'pending' || state.status === 'awaiting-approval'
        ? { status: 'confirmed', hash: event.hash }
        : state
    case 'error':
      if (state.status === 'idle' || state.status === 'confirmed') return state
      return {
        status: 'failed',
        code: event.code,
        reason: event.reason,
        hash: state.status === 'pending' ? state.hash : undefined,
      }
  }
}

export const isBusy = (s: TxState) =>
  s.status === 'awaiting-signature' || s.status === 'awaiting-approval' || s.status === 'pending'

/** ChainRoll custom errors we explain to users. */
const CONTRACT_ERRORS = [
  'AlreadyClaimedToday',
  'FilmNotActive',
  'NotRollOwner',
  'RollFull',
  'RollNotFull',
  'AlreadyDeveloped',
  'HashAlreadyUsed',
  'EnforcedPause',
] as const
export type ContractErrorName = (typeof CONTRACT_ERRORS)[number]

/** Map anything a wallet / viem / Bitkub SDK throws to a stable code (UI maps code → Thai copy). */
export function classifyTxError(err: unknown): { code: TxErrorCode; reason?: string } {
  const e = err as {
    name?: string
    shortMessage?: string
    message?: string
    code?: number
    cause?: unknown
  }
  const text = `${e?.name ?? ''} ${e?.shortMessage ?? ''} ${e?.message ?? ''} ${
    (e?.cause as { message?: string } | undefined)?.message ?? ''
  }`

  if (
    e?.code === 4001 ||
    /UserRejected|user rejected|denied transaction|rejected the request/i.test(text)
  )
    return { code: 'rejected' }
  const named = CONTRACT_ERRORS.find((n) => text.includes(n))
  if (named) return { code: 'reverted', reason: named }
  if (/insufficient funds/i.test(text)) return { code: 'insufficient-funds' }
  if (/chain mismatch|does not match the target chain|wrong network|ChainMismatch/i.test(text))
    return { code: 'wrong-network' }
  if (/quota/i.test(text)) return { code: 'quota' }
  if (/timed? ?out/i.test(text)) return { code: 'timeout' }
  if (/revert/i.test(text)) return { code: 'reverted' }
  return { code: 'unknown' }
}
