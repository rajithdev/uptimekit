# syntax=docker/dockerfile:1
# UptimeKit web app (Next.js standalone output).

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.9.0 --activate
WORKDIR /repo

FROM base AS build
COPY . .
# `prisma generate` makes no database connection; a placeholder DATABASE_URL is passed
# defensively for this build step only and is not baked into the image.
# No BuildKit cache mount: Railway's builder requires service-specific cache ids,
# and the image must build identically on Railway, CI and locally.
RUN pnpm install --frozen-lockfile \
  && DATABASE_URL=postgresql://build:build@localhost:5432/build pnpm --filter @uptimekit/database generate \
  && pnpm --filter @uptimekit/web build \
  && mkdir -p apps/web/public

FROM node:22-alpine AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
# outputFileTracingRoot is the monorepo root, so server.js lives under apps/web/.
COPY --from=build --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /repo/apps/web/public ./apps/web/public
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
