import path from 'node:path';
import type { NextConfig } from 'next';

// Đọc lúc `next build` và ghi cứng vào bản build (rewrites) ⇒ image Docker truyền qua build-arg API_URL.
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // Docker: bản chạy độc lập (.next/standalone) gồm cả @saha/shared ngoài thư mục app.
  ...(process.env.NEXT_STANDALONE === '1' && {
    output: 'standalone' as const,
    // `pnpm --filter @saha/web build` chạy với cwd = apps/web ⇒ gốc monorepo ở hai cấp trên.
    outputFileTracingRoot: path.join(process.cwd(), '../..'),
  }),
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  // Proxy API cùng origin để refresh-token cookie (httpOnly, SameSite=Lax) hoạt động.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_URL}/api/v1/:path*` }];
  },
};

export default nextConfig;
