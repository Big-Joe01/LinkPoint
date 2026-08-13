import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import { config } from './config/env';
import { logger } from './lib/logger';
import { registerAuthPlugin } from './plugins/auth';
import { registerHealthRoutes } from './modules/health/health.routes';
import { registerAuthRoutes } from './modules/auth/auth.routes';
import { registerUserRoutes } from './modules/users/user.routes';
import { registerPropertyRoutes } from './modules/properties/property.routes';
import { registerWalletRoutes } from './modules/wallet/wallet.routes';
import { registerInspectionRoutes } from './modules/inspections/inspection.routes';
import { registerTransactionRoutes } from './modules/transactions/transaction.routes';
import { registerMessagingRoutes } from './modules/messaging/messaging.routes';
import { registerAffiliateRoutes } from './modules/affiliates/affiliate.routes';
import { registerAdRoutes } from './modules/ads/ad.routes';
import { registerSubscriptionRoutes } from './modules/subscriptions/subscription.routes';
import { registerAdminRoutes } from './modules/admin/admin.routes';
import { registerNotificationRoutes } from './modules/notifications/notification.routes';
import { registerFavoriteRoutes } from './modules/favorites/favorite.routes';
import { registerMediaRoutes } from './modules/properties/media.routes';
import { registerFlutterwaveWebhook } from './modules/wallet/webhook.routes';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // we use pino directly
    trustProxy: true,
    bodyLimit: 2_000_000,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // API only
    hsts: { maxAge: 31536000 },
  });
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    allowList: ['127.0.0.1'],
  });
  await app.register(fastifyWebsocket, {
    options: { maxPayload: 1024 * 1024 },
  });

  await registerAuthPlugin(app);

  // Global error handler — never leak internals.
  app.setErrorHandler((err, _req, reply) => {
    const statusCode = err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
    if (statusCode >= 500) {
      logger.error({ err }, 'Unhandled server error');
    }
    reply.code(statusCode).send({
      statusCode,
      error: err.name || 'Error',
      message: statusCode >= 500 ? 'Internal server error' : err.message,
    });
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ statusCode: 404, error: 'Not Found', message: `Route ${req.method} ${req.url} not found` });
  });

  // Routes
  const prefix = config.apiPrefix;
  await registerHealthRoutes(app, prefix);
  await registerFlutterwaveWebhook(app, prefix);
  await registerAuthRoutes(app, prefix);
  await registerUserRoutes(app, prefix);
  await registerMediaRoutes(app, prefix);
  await registerPropertyRoutes(app, prefix);
  await registerFavoriteRoutes(app, prefix);
  await registerWalletRoutes(app, prefix);
  await registerInspectionRoutes(app, prefix);
  await registerTransactionRoutes(app, prefix);
  await registerMessagingRoutes(app, prefix);
  await registerAffiliateRoutes(app, prefix);
  await registerAdRoutes(app, prefix);
  await registerSubscriptionRoutes(app, prefix);
  await registerNotificationRoutes(app, prefix);
  await registerAdminRoutes(app, prefix);

  return app;
}
