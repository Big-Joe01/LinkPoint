import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';
import { notFound, parseOr400, unauthorized } from '../../lib/errors';
import { favoriteSchema } from '@linkpoint/validation';

async function toggleFavorite(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const input = parseOr400(favoriteSchema, req.body);
  const existing = await prisma.favorite.findUnique({
    where: { userId_propertyId: { userId: req.user.id, propertyId: input.propertyId } },
  });
  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    await prisma.property.update({ where: { id: input.propertyId }, data: { saveCount: { decrement: 1 } } });
    return { saved: false };
  }
  await prisma.favorite.create({ data: { userId: req.user.id, propertyId: input.propertyId } });
  await prisma.property.update({ where: { id: input.propertyId }, data: { saveCount: { increment: 1 } } });
  return { saved: true };
}

async function listFavorites(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const items = await prisma.favorite.findMany({
    where: { userId: req.user.id },
    include: { property: { include: { owner: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  return { items };
}

export function registerFavoriteRoutes(app: FastifyInstance, prefix: string): void {
  app.post(`${prefix}/favorites`, { preHandler: app.authenticate, handler: toggleFavorite as never });
  app.get(`${prefix}/favorites`, { preHandler: app.authenticate, handler: listFavorites as never });
}
