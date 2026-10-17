import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ClausesModule } from './clauses/clauses.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { JwtAuthGuard, PermissionsGuard } from './common/guards.js';
import { validateEnv } from './config/env.js';
import { ContractsModule } from './contracts/contracts.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { HealthController } from './health/health.controller.js';
import { PartnersModule } from './partners/partners.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { StorageModule } from './storage/storage.module.js';
import { TemplatesModule } from './templates/templates.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuditModule,
    StorageModule,
    AuthModule,
    PartnersModule,
    ContractsModule,
    DashboardModule,
    DocumentsModule,
    TemplatesModule,
    ClausesModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
