import type { Address, Hex } from 'viem'
import type { TxEvent } from './tx'

export type WalletKind = 'bitkub-next' | 'injected' | 'dev'

export type TxHooks = { onEvent: (e: TxEvent) => void }

/**
 * The only way app code talks to a wallet (PROJECT_BRIEF §5.1).
 * Each call resolves with the mined tx hash, or throws (classify with `classifyTxError`).
 */
export interface WalletAdapter {
  kind: WalletKind
  address: Address
  claimDailyRoll(filmId: number, hooks: TxHooks): Promise<Hex>
  shoot(rollId: bigint, photoHash: Hex, hooks: TxHooks): Promise<Hex>
  develop(rollId: bigint, hooks: TxHooks): Promise<Hex>
}
