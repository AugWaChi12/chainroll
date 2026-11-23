import { createPublicClient, fallback, formatEther, http, type Address } from 'viem'
import { activeChain } from './chain'

export type KubBlockConfirmation = {
  blockNumber: bigint | null
  /** true when confirmed by an actual live KUB Chain RPC block advance */
  live: boolean
}

let cachedClient: ReturnType<typeof createPublicClient> | null = null

function getKubPublicClient() {
  if (!cachedClient) {
    cachedClient = createPublicClient({
      chain: activeChain,
      transport: fallback(activeChain.rpcUrls.default.http.map((url) => http(url))),
    })
  }
  return cachedClient
}

/** Reads the live native KUB balance (in KUB) directly from KUB Chain RPC. */
export async function getKubBalance(address: Address): Promise<number | null> {
  try {
    const wei = await getKubPublicClient().getBalance({ address })
    return Number(formatEther(wei))
  } catch {
    return null
  }
}

/** Waits for an actual KUB Chain transaction receipt and returns its block number. */
export async function waitForKubTxReceipt(hash: `0x${string}`): Promise<bigint | null> {
  const receipt = await getKubPublicClient().waitForTransactionReceipt({
    hash,
    pollingInterval: 250,
  })
  return receipt.blockNumber
}

/**
 * Waits in real time for the next actual block on KUB Chain (1s block time via `activeChain` RPC).
 * Falls back gracefully after `timeoutMs` if the RPC is unreachable/offline.
 */
export async function waitForNextKubBlock(timeoutMs = 3500): Promise<KubBlockConfirmation> {
  const client = getKubPublicClient()

  let startBlock: bigint | null = null
  try {
    startBlock = await client.getBlockNumber()
  } catch {
    await new Promise((r) => setTimeout(r, 1000))
    return { blockNumber: null, live: false }
  }

  return new Promise<KubBlockConfirmation>((resolve) => {
    let settled = false
    let unwatch: (() => void) | undefined

    const finish = (res: KubBlockConfirmation) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      unwatch?.()
      resolve(res)
    }

    const timer = setTimeout(() => {
      finish({ blockNumber: startBlock !== null ? startBlock + 1n : null, live: false })
    }, timeoutMs)

    try {
      unwatch = client.watchBlockNumber({
        poll: true,
        pollingInterval: 250,
        onBlockNumber: (blockNumber) => {
          if (startBlock === null || blockNumber > startBlock) {
            finish({ blockNumber, live: true })
          }
        },
        onError: () => {
          // keep waiting until timeout fallback
        },
      })
    } catch {
      finish({ blockNumber: startBlock !== null ? startBlock + 1n : null, live: false })
    }
  })
}
