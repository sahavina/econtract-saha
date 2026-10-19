# syntax=docker/dockerfile:1.7
# Image API (NestJS) + target "migrate" chạy prisma migrate deploy và bootstrap.
# Build từ gốc monorepo:  docker build -f infra/docker/api.Dockerfile -t saha-econtract-api .

ARG NODE_VERSION=24-alpine

FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

# ── Cài toàn bộ dependency (kể cả dev) và build ──
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter @saha/api... \
 && pnpm --filter @saha/shared build \
 && pnpm --filter @saha/api build

# ── Migration + khởi tạo lần đầu (cần prisma CLI và tsx từ devDependencies) ──
FROM build AS migrate
WORKDIR /repo/apps/api
USER node
# Gọi thẳng binary: không cần corepack/pnpm khi chạy bằng user node.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node_modules/.bin/tsx prisma/bootstrap.ts"]

# ── Runtime ──
# Cài dependency production ngay tại stage này thay vì COPY cây node_modules của pnpm giữa các stage
# (snapshotter containerd, ví dụ Rancher Desktop, lỗi "failed to commit … snapshot does not exist" khi chép cây đó).
FROM base AS runtime
# LibreOffice Writer (~340 MB): chuyển Word 97–2003 (.doc) → .docx khi tạo hợp đồng từ file (POST /documents/convert-doc).
RUN apk add --no-cache libreoffice-writer
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts --filter @saha/api...
ENV NODE_ENV=production PORT=4000 STORAGE_DIR=/data/storage
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/
COPY --from=build /repo/apps/api/dist ./apps/api/dist
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/main.js"]
