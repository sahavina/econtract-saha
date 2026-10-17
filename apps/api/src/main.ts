import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { z } from 'zod';
import { AppModule } from './app.module.js';
import { type Env, productionWarnings } from './config/env.js';

// Thông báo lỗi validation mặc định bằng tiếng Việt.
z.config(z.locales.vi());

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((s) => s.trim()),
    credentials: true,
  });
  app.enableShutdownHooks();

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const doc = new DocumentBuilder()
      .setTitle('SAHA eContract API')
      .setDescription('Electronic Contract & Contract Lifecycle Management Platform')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  }

  const warnings = productionWarnings({
    NODE_ENV: config.get('NODE_ENV', { infer: true }),
    STORAGE_DRIVER: config.get('STORAGE_DRIVER', { infer: true }),
    APP_URL: config.get('APP_URL', { infer: true }),
  });
  for (const w of warnings) Logger.warn(w, 'Config');

  const port = config.get('PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API chạy tại cổng ${port}, tiền tố /api/v1`, 'Bootstrap');
}
await bootstrap();
