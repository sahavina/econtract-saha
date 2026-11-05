import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { ApprovalsModule } from './approvals/approvals.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ClausesModule } from './clauses/clauses.module.js';
import { CompanyModule } from './company/company.module.js';
import { ContractShareModule } from './contract-share/contract-share.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { JwtAuthGuard, PermissionsGuard } from './common/guards.js';
import { validateEnv } from './config/env.js';
import { ContractsModule } from './contracts/contracts.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { EsignModule } from './esign/esign.module.js';
import { HealthController } from './health/health.controller.js';
import { IntegrationsModule } from './integrations/integrations.module.js';
import { LifecycleModule } from './lifecycle/lifecycle.module.js';
import { MailModule } from './mail/mail.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PartnersModule } from './partners/partners.module.js';
import { DeliveriesModule } from './deliveries/deliveries.module.js';
import { PaymentRequestsModule } from './payment-requests/payment-requests.module.js';
import { QuotesModule } from './quotes/quotes.module.js';
import { ProductsModule } from './products/products.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SignaturesModule } from './signatures/signatures.module.js';
import { StorageModule } from './storage/storage.module.js';
import { TemplatesModule } from './templates/templates.module.js';
import { WorkflowsModule } from './workflows/workflows.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
    PrismaModule,
    AuditModule,
    PlatformModule,
    StorageModule,
    MailModule,
    NotificationsModule,
    AuthModule,
    PartnersModule,
    ProductsModule,
    DeliveriesModule,
    PaymentRequestsModule,
    QuotesModule,
    ContractsModule,
    ContractShareModule,
    DashboardModule,
    DocumentsModule,
    EsignModule,
    TemplatesModule,
    ClausesModule,
    CompanyModule,
    WorkflowsModule,
    ApprovalsModule,
    SignaturesModule,
    AdminModule,
    LifecycleModule,
    ReportsModule,
    IntegrationsModule,
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
