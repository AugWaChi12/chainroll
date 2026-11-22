# ChainRoll (deeKub)

On-chain film camera for KUB Chain — spec: [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md)

```bash
pnpm install
pnpm dev          # web  → http://localhost:3000  (admin: /admin, camera: /camera)
pnpm storybook    # ui   → http://localhost:6006
pnpm lint && pnpm typecheck && pnpm build
```

| Path              | What                                                                               |
| ----------------- | ---------------------------------------------------------------------------------- |
| `apps/web`        | Next.js 16 app — routes in `src/app`, domain code in `src/features/*`              |
| `packages/ui`     | Design system: tokens, primitives, DataTable, film components, AppShell, Storybook |
| `packages/shared` | Chain config & shared types                                                        |
| `packages/config` | tsconfig presets                                                                   |
