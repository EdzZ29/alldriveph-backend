import fastifyCompress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { Logger } from '@nestjs/common';
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

import { settings } from './config/settings';

export function createAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    trustProxy: settings.trustProxy,
    requestIdHeader: 'x-request-id',
    genReqId: () => randomUUID().replaceAll('-', ''),
    bodyLimit: 1024 * 1024,
  });
}

const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  ...(settings.isProduction
    ? { 'strict-transport-security': 'max-age=63072000; includeSubDomains' }
    : {}),
};

/** Plugins, hooks and pipes shared by main.ts and the tests. */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  const logger = new Logger('HTTP');
  const fastify = app.getHttpAdapter().getInstance();

  await app.register(fastifyCookie);
  await app.register(fastifyCompress, { threshold: 1024 });
  app.enableCors({
    origin: settings.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 600,
  });

  mkdirSync(settings.mediaDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: settings.mediaDir,
    prefix: `${settings.mediaUrlPrefix}/`,
    decorateReply: false,
  });

  // image uploads (multipart/form-data to the API endpoint); the upload enforces the size limit
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: settings.maxUploadMb * 1024 * 1024,
      files: 1,
      fields: 5,
    },
  });

  const allowAnyHost = settings.allowedHosts.includes('*');
  fastify.addHook('onRequest', async (request, reply) => {
    if (
      !allowAnyHost &&
      !settings.allowedHosts.includes(request.hostname.split(':')[0])
    ) {
      return reply.status(400).send({ detail: 'Invalid host header' });
    }
  });

  fastify.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
    for (const [name, value] of Object.entries(SECURITY_HEADERS))
      reply.header(name, value);
  });

  fastify.addHook('onResponse', async (request, reply) => {
    if (request.url === '/health') return;
    logger.log(
      `${request.method} ${request.url} ${reply.statusCode} ${reply.elapsedTime.toFixed(1)}ms ` +
        `[${request.id}]`,
    );
  });

  app.enableShutdownHooks();
}
