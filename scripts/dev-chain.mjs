// Local KUB-like chain for development: starts anvil and deploys ChainRoll.
// Usage: pnpm dev:chain   (then `pnpm dev` with NEXT_PUBLIC_CHAIN=local)
// Uses anvil's PUBLIC test key #0 — never use it on a real network.
import { spawn, spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const contracts = join(root, 'packages/contracts')
const bin = (name) =>
  join(contracts, 'node_modules/.bin', process.platform === 'win32' ? `${name}.cmd` : name)
const ANVIL_KEY_0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
// anvil account #9 plays the Bitkub NEXT sdkCallHelperRouter locally
const FAKE_ROUTER = '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720'

const anvil = spawn(bin('anvil'), ['--port', '8545', '--chain-id', '31337', '--block-time', '1'], {
  stdio: ['ignore', 'pipe', 'inherit'],
  shell: process.platform === 'win32',
})

let deployed = false
anvil.stdout.on('data', (buf) => {
  if (deployed || !String(buf).includes('Listening on')) return
  deployed = true
  const r = spawnSync(
    bin('forge'),
    [
      'script',
      'script/Deploy.s.sol',
      '--rpc-url',
      'http://127.0.0.1:8545',
      '--broadcast',
      '--private-key',
      ANVIL_KEY_0,
    ],
    {
      cwd: contracts,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, NEXT_ROUTER: FAKE_ROUTER },
    },
  )
  if (r.status !== 0) {
    console.error('deploy failed')
    anvil.kill()
    process.exit(1)
  }
  console.log('\n✓ local chain ready at http://127.0.0.1:8545 (chain 31337) — Ctrl+C to stop\n')
})

const stop = () => {
  anvil.kill()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
