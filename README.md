# ChainRoll

On-chain film camera for KUB Chain — spec: [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md)

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # NEXT_PUBLIC_CHAIN=local by default
pnpm dev:chain    # local chain (anvil) + deploy ChainRoll — keep running
pnpm dev          # web  → http://localhost:3000  (admin: /admin, camera: /camera)
pnpm storybook    # ui   → http://localhost:6006
pnpm lint && pnpm typecheck && pnpm build
```

| Path                 | What                                                                               |
| -------------------- | ---------------------------------------------------------------------------------- |
| `apps/web`           | Next.js 16 app — routes in `src/app`, domain code in `src/features/*`              |
| `packages/ui`        | Design system: tokens, primitives, DataTable, film components, AppShell, Storybook |
| `packages/contracts` | ChainRoll.sol + Foundry tests; ABI exported as TS                                  |
| `packages/shared`    | Chain config & shared types                                                        |
| `packages/config`    | tsconfig presets                                                                   |
