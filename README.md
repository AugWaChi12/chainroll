# ChainRoll

**On-chain 35mm analog film camera PWA & 1/1 Analog Print NFT marketplace built for [KUB Chain](https://www.kubchain.com).**

Live MVP (KUB Testnet): **[https://chainroll.nan-tai.com](https://chainroll.nan-tai.com)**

---

## Highlights

- **Live-Camera-Only 35mm Capture (`/camera`):** WebGL2 real-time film emulation (6 film stocks, EV `-1.0..+1.0`, rule-of-thirds grid, 90s quartz date imprint, mechanical shutter SFX). No gallery uploads — every frame is hashed client-side (`keccak256`) and sealed on KUB Chain (`1 photo = 1 tx`).
- **Darkroom & Cross-Device Sync (`/darkroom`):** Configurable darkroom development delay, 1600px **35mm Contact Sheet PNG** export, and zero-SIWE cryptographic (`keccak256`-verified) private R2 cloud backup with 7-day SIWE owner-only cross-device viewing (Phone ↔ PC).
- **Anti-AI On-Chain Photo Verifier (`/verify`):** 100% client-side `keccak256` verification against KUB Chain records — photos never leave the browser.
- **AI Visual Search & Editorial Feed (`/feed`, `/p/[id]`):** Cursor-paginated feed with ultra-low-token Gemini Vision bilingual auto-tagging (`~180 tokens/photo`), zero-token Thai ↔ English query expansion in PostgreSQL, and dynamic `1200×630` 35mm OG Share Cards.
- **1/1 Analog Print Marketplace & Profiles (`/u/[address]`, `/activity`):** ERC-721 1/1 Analog Prints (`ChainRollPrints.sol`) with 5% ERC-2981 creator royalties, escrow offers, photographer profiles, live on-chain activity feed, and SIWE-locked Darkroom Admin Console (`/admin`).

---

## Live Smart Contracts — KUB Testnet (`Chain ID: 25925`)

| Contract | Address | Notes |
| :--- | :--- | :--- |
| **`ChainRoll.sol`** | `0x54Aa4a0f7d54014Ba6785afF8926A7e4E2d61833` | Daily roll claims (configurable, 2 rolls/day, UTC+7), per-frame `photoHash` proof, `develop` / `developEarly`, Bitkub NEXT `router`-ready |
| **`ChainRollPrints.sol`** | `0x4eeFa5d9c1dd449c0Cc48AeE40FDc89AE5771730` | 1/1 Analog Print NFT (ERC-721 + ERC-2981 5% royalty + on-chain escrow offers) |

---

## Repository Structure

| Path | Description |
| :--- | :--- |
| `apps/web` | Next.js 16 (App Router, Turbopack) PWA — routes in `src/app`, domain modules in `src/features/*`, server DB/AI/R2/Auth in `src/server/*` |
| `packages/ui` | Design system: semantic film tokens, primitives, DataTable, film components, AppShell, Storybook |
| `packages/contracts` | `ChainRoll.sol` + `ChainRollPrints.sol` + deployment scripts + **35 Foundry tests** |
| `packages/shared` | KUB Chain network definitions (`96` Mainnet, `25925` Testnet, `31337` Local) & shared types |
| `packages/config` | Shared TypeScript / ESLint presets |
| `supabase/migrations` | PostgreSQL 17 schema & Row Level Security migrations |
| `deploy` | Production Docker Compose (`db` + `web` + `caddy`), Caddyfile, and automated daily off-site R2 database backup script |

---

## Brand Assets (KUB Developer Center Ready)

- Official 512×512 PNG Logo (< 1 MB): [`apps/web/public/brand/chainroll-logo-512.png`](apps/web/public/brand/chainroll-logo-512.png)

---

## Local Development

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm db:up        # local Postgres 17 in Docker (127.0.0.1:5435)
pnpm dev:chain    # local chain (anvil :8545) + deploy ChainRoll & ChainRollPrints
pnpm dev          # web → http://localhost:3000
```

### Verification Suite

```bash
pnpm lint         # ESLint (0 errors, 0 warnings)
pnpm typecheck    # Next.js typegen + tsc --noEmit
pnpm test         # 45 Vitest web & security tests
cd packages/contracts && pnpm exec forge test   # 35 Foundry smart contract tests
```
