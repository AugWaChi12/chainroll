import { chainRollAbi } from '@chainroll/contracts'
import type { Address, Hex } from 'viem'
import { waitForTransactionReceipt, writeContract } from 'wagmi/actions'
import type { TxHooks, WalletAdapter, WalletKind } from './adapter'
import { activeChain } from './chain'
import { wagmiConfig } from './config'

/** MetaMask / any EIP-1193 wallet (and the local dev wallet). User = msg.sender. */
export function createInjectedAdapter(
  address: Address,
  contract: Address,
  kind: WalletKind = 'injected',
): WalletAdapter {
  const send = async (hooks: TxHooks, write: () => Promise<Hex>) => {
    hooks.onEvent({ type: 'sign' })
    const hash = await write()
    hooks.onEvent({ type: 'submitted', hash })
    const receipt = await waitForTransactionReceipt(wagmiConfig, { hash, chainId: activeChain.id })
    if (receipt.status !== 'success') throw new Error('transaction reverted')
    hooks.onEvent({ type: 'mined', hash })
    return hash
  }
  const base = {
    address: contract,
    abi: chainRollAbi,
    chainId: activeChain.id,
    account: address,
  } as const

  return {
    kind,
    address,
    claimDailyRoll: (filmId, hooks) =>
      send(hooks, () =>
        writeContract(wagmiConfig, { ...base, functionName: 'claimDailyRoll', args: [filmId] }),
      ),
    shoot: (rollId, photoHash, hooks) =>
      send(hooks, () =>
        writeContract(wagmiConfig, { ...base, functionName: 'shoot', args: [rollId, photoHash] }),
      ),
    develop: (rollId, hooks) =>
      send(hooks, () =>
        writeContract(wagmiConfig, { ...base, functionName: 'develop', args: [rollId] }),
      ),
  }
}
