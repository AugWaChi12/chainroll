# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@12.15.0 --activate

# ── 1. Install workspace dependencies ──
FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/config/package.json ./packages/config/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
RUN pnpm install --frozen-lockfile --ignore-scripts

# ── 2. Build @chainroll/web (standalone) ──
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules
COPY . .

ARG NEXT_PUBLIC_SITE_URL=https://chainroll.art
ARG NEXT_PUBLIC_CHAIN=testnet
ARG NEXT_PUBLIC_CHAINROLL_ADDRESS=
ARG NEXT_PUBLIC_WC_PROJECT_ID=
ARG NEXT_PUBLIC_BITKUB_CLIENT_ID=
ARG NEXT_PUBLIC_BITKUB_SDK_ID=

ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_CHAIN=$NEXT_PUBLIC_CHAIN
ENV NEXT_PUBLIC_CHAINROLL_ADDRESS=$NEXT_PUBLIC_CHAINROLL_ADDRESS
ENV NEXT_PUBLIC_WC_PROJECT_ID=$NEXT_PUBLIC_WC_PROJECT_ID
ENV NEXT_PUBLIC_BITKUB_CLIENT_ID=$NEXT_PUBLIC_BITKUB_CLIENT_ID
ENV NEXT_PUBLIC_BITKUB_SDK_ID=$NEXT_PUBLIC_BITKUB_SDK_ID
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=1536"

RUN pnpm --filter @chainroll/web build

# ── 3. Lean production runtime ──
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME="0.0.0.0"
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
