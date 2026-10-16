import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module';
import { configureApp, createAdapter } from './app.setup';
import { settings } from './config/settings';
import { API_PATH } from './rpc.controller';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    createAdapter(),
    {
      logger: settings.isProduction
        ? ['log', 'warn', 'error']
        : ['log', 'warn', 'error', 'debug'],
    },
  );
  await configureApp(app);
  await app.listen(settings.port, '0.0.0.0');
  const logger = new Logger('Bootstrap');
  logger.log(
    `${settings.appName} (${settings.environment}) on port ${settings.port}`,
  );
  logger.log(`API: POST http://localhost:${settings.port}${API_PATH}`);
}

void bootstrap();
