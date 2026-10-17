import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

@ApiTags('Health')
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Liveness: tiến trình còn phản hồi (không phụ thuộc DB) – dùng cho restart policy. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: DB và kho lưu trữ dùng được – dùng cho healthcheck/load balancer. */
  @Get()
  async check() {
    const [database, storage] = await Promise.all([
      withTimeout(this.prisma.$queryRaw`SELECT 1`, 3000).then(
        () => 'up' as const,
        () => 'down' as const,
      ),
      withTimeout(this.storage.check(), 3000).then(
        () => 'up' as const,
        () => 'down' as const,
      ),
    ]);
    const body = {
      status: database === 'up' && storage === 'up' ? 'ok' : 'error',
      database,
      storage,
      storageDriver: this.storage.name,
      time: new Date().toISOString(),
    };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }
}
