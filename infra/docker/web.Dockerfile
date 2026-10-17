# syntax=docker/dockerfile:1.7
# Image web (Next.js standalone).
# Build từ gốc monorepo:  docker build -f infra/docker/web.Dockerfile --build-arg API_URL=http://api:4000 -t saha-econtract-web .
# API_URL được ghi cứng vào bản build (rewrites /api/v1/* → API), đổi giá trị thì phải build lại.

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

FROM base AS build
ARG API_URL=http://api:4000
ENV API_URL=${API_URL} NEXT_STANDALONE=1
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter @saha/web... \
 && pnpm --filter @saha/shared build \
 && pnpm --filter @saha/web build

FROM node:${NODE_VERSION} AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# server.js nằm ở apps/web trong thư mục standalone (outputFileTracingRoot = gốc monorepo).
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
