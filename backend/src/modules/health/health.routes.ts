import { FastifyInstance } from 'fastify';
import { prisma } from '../../lib/prisma';

export async function registerHealthRoutes(app: FastifyInstance, prefix: string): Promise<void> {
  app.get(`${prefix}/health`, async () => {
    let dbOk = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      service: 'linkpoint-backend',
      time: new Date().toISOString(),
      database: dbOk ? 'connected' : 'disconnected',
    };
  });
}
