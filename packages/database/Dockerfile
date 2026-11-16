# syntax=docker/dockerfile:1
# One-shot migration image: applies pending Prisma migrations and exits.
# Required env: DATABASE_URL
FROM node:22-alpine
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable && corepack prepare pnpm@10.9.0 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
RUN pnpm install --frozen-lockfile --filter @uptimekit/database... \
  && pnpm store prune

COPY packages/config packages/config
COPY packages/database/prisma packages/database/prisma
COPY packages/database/prisma.config.ts packages/database/

RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app
WORKDIR /app/packages/database
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]
