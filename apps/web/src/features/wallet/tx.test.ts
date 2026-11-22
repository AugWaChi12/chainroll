import { describe, expect, it } from 'vitest'
import { classifyTxError, isBusy, txReducer, type TxState } from './tx'

const H = '0xabc' as const

describe('txReducer', () => {
  it('MetaMask happy path: sign → submitted → mined', () => {
    let s: TxState = { status: 'idle' }
    s = txReducer(s, { type: 'sign' })
    expect(s.status).toBe('awaiting-signature')
    s = txReducer(s, { type: 'submitted', hash: H })
    expect(s).toEqual({ status: 'pending', hash: H })
    expect(isBusy(s)).toBe(true)
    s = txReducer(s, { type: 'mined', hash: H })
    expect(s).toEqual({ status: 'confirmed', hash: H })
    expect(isBusy(s)).toBe(false)
  })

  it('Bitkub NEXT path goes through approval', () => {
    let s: TxState = txReducer({ status: 'idle' }, { type: 'sign' })
    s = txReducer(s, { type: 'approval', approvalUrl: 'https://next/approve' })
    expect(s.status).toBe('awaiting-approval')
    s = txReducer(s, { type: 'mined', hash: H })
    expect(s.status).toBe('confirmed')
  })

  it('keeps the tx hash when a pending tx fails', () => {
    let s: TxState = txReducer({ status: 'idle' }, { type: 'sign' })
    s = txReducer(s, { type: 'submitted', hash: H })
    s = txReducer(s, { type: 'error', code: 'reverted', reason: 'RollFull' })
    expect(s).toEqual({ status: 'failed', code: 'reverted', reason: 'RollFull', hash: H })
  })

  it('can retry after failure, ignores stray events', () => {
    const failed: TxState = { status: 'failed', code: 'rejected' }
    expect(txReducer(failed, { type: 'sign' }).status).toBe('awaiting-signature')
    expect(txReducer({ status: 'idle' }, { type: 'mined', hash: H })).toEqual({ status: 'idle' })
    const done: TxState = { status: 'confirmed', hash: H }
    expect(txReducer(done, { type: 'error', code: 'unknown' })).toBe(done)
  })
})

describe('classifyTxError', () => {
  it('detects user rejection (EIP-1193 4001 and viem text)', () => {
    expect(classifyTxError({ code: 4001 }).code).toBe('rejected')
    expect(classifyTxError(new Error('User rejected the request.')).code).toBe('rejected')
  })

  it('extracts ChainRoll custom errors', () => {
    const err = {
      shortMessage: 'The contract function "shoot" reverted.',
      message: 'Error: RollFull(uint256 rollId)',
    }
    expect(classifyTxError(err)).toEqual({ code: 'reverted', reason: 'RollFull' })
    expect(classifyTxError(new Error('AlreadyClaimedToday(1797267600)'))).toEqual({
      code: 'reverted',
      reason: 'AlreadyClaimedToday',
    })
  })

  it('detects funds, network, unknown', () => {
    expect(classifyTxError(new Error('insufficient funds for gas * price + value')).code).toBe(
      'insufficient-funds',
    )
    expect(classifyTxError({ name: 'ChainMismatchError' }).code).toBe('wrong-network')
    expect(classifyTxError('???').code).toBe('unknown')
  })
})
