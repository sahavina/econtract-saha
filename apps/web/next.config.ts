import type { NextConfig } from 'next';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
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
