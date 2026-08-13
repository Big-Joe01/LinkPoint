import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';
import { unauthorized } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/crypto';
import { z } from 'zod';

async function me(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      roles: true,
      status: true,
      emailVerified: true,
      phoneVerified: true,
      profileImage: true,
      createdAt: true,
      customer: true,
      realtor: true,
      agent: true,
      affiliate: true,
      wallet: { select: { balanceMinor: true, pendingMinor: true, currency: true } },
    },
  });
  if (!user) throw unauthorized('User not found');
  return user;
}

const updateProfileSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().min(7).max(20).optional(),
  profileImage: z.string().url().optional(),
});

async function updateProfile(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const input = updateProfileSchema.parse(req.body);
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: input,
    select: { id: true, name: true, phone: true, profileImage: true },
  });
  return user;
}

const setPinSchema = z.object({
  pin: z.string().min(4).max(8),
  currentPin: z.string().optional(),
});

async function setWalletPin(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const input = setPinSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) throw unauthorized();
  if (user.walletPinHash && input.currentPin) {
    const ok = await verifyPassword(input.currentPin, user.walletPinHash);
    if (!ok) throw unauthorized('Incorrect current PIN');
  } else if (user.walletPinHash && !input.currentPin) {
    throw unauthorized('Current PIN required to change PIN');
  }
  const walletPinHash = await hashPassword(input.pin);
  await prisma.user.update({ where: { id: req.user.id }, data: { walletPinHash } });
  return { message: 'Wallet PIN set' };
}

const addRoleSchema = z.object({ role: z.enum(['CUSTOMER', 'REALTOR', 'PROPERTY_OWNER', 'INSPECTION_AGENT', 'AFFILIATE']) });

async function addRole(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const input = addRoleSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) throw unauthorized();
  const roles = (user.roles as string[]).slice();
  if (roles.includes(input.role)) return { message: 'Role already assigned', roles };
  roles.push(input.role);
  const data: Record<string, unknown> = { roles: roles as never };
  // create corresponding profile if missing
  if (input.role === 'CUSTOMER') data.customer = { create: {} };
  if (input.role === 'REALTOR' || input.role === 'PROPERTY_OWNER') data.realtor = { create: { category: input.role } };
  if (input.role === 'INSPECTION_AGENT') data.agent = { create: { operatingCities: [] } };
  if (input.role === 'AFFILIATE') {
    const { nanoid } = await import('nanoid');
    data.affiliate = { create: { referralCode: nanoid(10) } };
  }
  await prisma.user.update({ where: { id: req.user.id }, data: data as never });
  return { message: 'Role added', roles };
}

export function registerUserRoutes(app: FastifyInstance, prefix: string): void {
  app.get(`${prefix}/users/me`, { preHandler: app.authenticate, handler: me as never });
  app.patch(`${prefix}/users/me`, { preHandler: app.authenticate, handler: updateProfile as never });
  app.post(`${prefix}/users/me/wallet-pin`, { preHandler: app.authenticate, handler: setWalletPin as never });
  app.post(`${prefix}/users/me/roles`, { preHandler: app.authenticate, handler: addRole as never });
}
