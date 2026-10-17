import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
    // Chỉ cần khi dùng `prisma dev` (shadow DB chạy ở cổng riêng).
    shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'],
  },
});
