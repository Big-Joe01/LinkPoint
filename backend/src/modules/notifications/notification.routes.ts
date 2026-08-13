import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';
import { unauthorized } from '../../lib/errors';

async function listNotifications(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { page = 1, pageSize = 20 } = (req.query as { page?: number; pageSize?: number }) ?? {};
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where: { userId: req.user.id } }),
    prisma.notification.count({ where: { userId: req.user.id, read: false } }),
  ]);
  return { items, total, unread, page, pageSize, hasNext: page * pageSize < total };
}

async function markRead(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { id } = req.params as { id: string };
  await prisma.notification.updateMany({
    where: { id, userId: req.user.id },
    data: { read: true },
  });
  return { ok: true };
}

async function markAllRead(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  await prisma.notification.updateMany({
    where: { userId: req.user.id, read: false },
    data: { read: true },
  });
  return { ok: true };
}

export function registerNotificationRoutes(app: FastifyInstance, prefix: string): void {
  app.get(`${prefix}/notifications`, { preHandler: app.authenticate, handler: listNotifications as never });
  app.post(`${prefix}/notifications/:id/read`, { preHandler: app.authenticate, handler: markRead as never });
  app.post(`${prefix}/notifications/read-all`, { preHandler: app.authenticate, handler: markAllRead as never });
}
