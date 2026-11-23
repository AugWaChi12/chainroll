# ChainRoll (`chainroll.art`)

On-chain 35mm film camera & 1/1 Analog Print NFT marketplace for **KUB Chain** — full spec & AI handoff status: [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md)

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm db:up        # local Postgres 17 in Docker (127.0.0.1:5435) + schema & seed
pnpm dev:chain    # local chain (anvil :8545) + deploy ChainRoll & ChainRollPrints
pnpm dev          # web  → http://localhost:3000  (admin: /admin, camera: /camera, feed: /feed)
pnpm storybook    # ui   → http://localhost:6006
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

| Path | What |
|---|---|
| `apps/web` | Next.js 16 app — routes in `src/app`, domain modules in `src/features/*` |
| `packages/ui` | Design system: semantic tokens, primitives, DataTable, film components, AppShell, Storybook |
| `packages/contracts` | `ChainRoll.sol` + `ChainRollPrints.sol` (1/1 ERC-721 + ERC-2981 5% Royalty + Escrow Offers) + 33 Foundry tests |
| `packages/shared` | KUB Chain config (`96` mainnet, `25925` testnet, `31337` local) & shared types |
| `packages/config` | TypeScript presets |
| `supabase/migrations` | Postgres 17 schema + Row Level Security (`0001_chainroll_schema.sql`) & dev seed (`0002_chainroll_seed.sql`) |
| `docker-compose.yml` | Local Postgres 17 container (`chainroll-db` on `127.0.0.1:5435`) auto-running `supabase/migrations/*` |
