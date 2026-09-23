# syntax=docker/dockerfile:1

# -----------------------------------------------------------------------------
# Rankly — multi-stage image (Next.js standalone + Prisma migrate helper)
# Build from repo root:
#   docker build -f docker/Dockerfile --target runner -t akshatpareek/rankly:dev .
#   docker build -f docker/Dockerfile --target migrate -t akshatpareek/rankly:dev-migrate .
# -----------------------------------------------------------------------------

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ---- dependencies (cached unless lockfile changes) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- build Next.js standalone ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Placeholder only — no DB access at build time (see ci.yml).
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"

RUN npx prisma generate --config prisma7.config.ts
RUN npm run build

# ---- production runner (minimal) ----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]

# ---- one-shot migrator + admin seed ----
FROM base AS migrate
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json prisma7.config.ts ./
COPY prisma ./prisma
COPY scripts/seed-admin.cjs ./scripts/seed-admin.cjs

RUN npx prisma generate --config prisma7.config.ts

ENV NODE_ENV=production
CMD ["sh", "-c", "npx prisma migrate deploy --config prisma7.config.ts && node scripts/seed-admin.cjs"]
