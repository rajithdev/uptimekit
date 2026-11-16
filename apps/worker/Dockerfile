# syntax=docker/dockerfile:1
# UptimeKit monitoring worker (scheduler + checks + notifications).

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@10.9.0 --activate
WORKDIR /repo

FROM base AS build
COPY . .
# `prisma generate` makes no database connection; a placeholder DATABASE_URL is passed
# defensively for this build step only and is not baked into the image.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm config set store-dir /pnpm/store \
  && pnpm install --frozen-lockfile \
  && DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @uptimekit/database generate \
  && pnpm --filter @uptimekit/worker build \
  && pnpm deploy --filter @uptimekit/worker --prod --legacy /out \
  && rm -rf /out/src /out/test

FROM node:22-alpine AS runtime
ENV NODE_ENV=production WORKER_HEALTH_PORT=8081
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /out/package.json ./package.json
COPY --from=build --chown=app:app /out/node_modules ./node_modules
COPY --from=build --chown=app:app /repo/apps/worker/dist ./dist
USER app
EXPOSE 8081
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.WORKER_HEALTH_PORT||8081)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# The worker handles SIGTERM itself (graceful shutdown); run node as PID 1 directly.
CMD ["node", "dist/main.js"]
