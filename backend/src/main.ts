import { config } from './config/env';
import { buildApp } from './app';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { ensureDefaultSettings } from './lib/bootstrap';

async function main(): Promise<void> {
  await ensureDefaultSettings();
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(`LinkPoint backend listening on http://0.0.0.0:${config.port}${config.apiPrefix}`);
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main().catch((err) => {
  logger.error({ err }, 'Fatal startup error');
  process.exit(1);
});
