import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound, parseOr400 } from '../../lib/errors';
import { PropertyStatus, VerificationStatus, UserStatus, SubscriptionStatus, AdStatus } from '../../../prisma/generated/client';
import { setSetting, getSettingString } from '../../lib/settings';
import { z } from 'zod';
import { audit } from '../../lib/audit';
import { toMinor } from '@linkpoint/shared';

// Admin guard plugin applied at route registration below.

async function listUsers(req: FastifyRequest) {
  const { role, status, page = 1, pageSize = 20 } = (req.query as { role?: string; status?: string; page?: number; pageSize?: number }) ?? {};
  const where = {
    ...(role ? { roles: { string_contains: role } } : {}),
    ...(status ? { status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where: where as never,
      select: { id: true, name: true, email: true, phone: true, roles: true, status: true, emailVerified: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where: where as never }),
  ]);
  return { items, total, page, pageSize, hasNext: page * pageSize < total };
}

async function setUserStatus(req: FastifyRequest) {
  const { id } = req.params as { id: string };
  const { status } = req.body as { status?: string };
  if (!status || !['ACTIVE', 'SUSPENDED', 'BANNED', 'RESTRICTED'].includes(status)) throw badRequest('Invalid status');
  const user = await prisma.user.update({ where: { id }, data: { status: status as never } });
  await audit('ADMIN_USER_STATUS', { userId: (req.user as { id: string })?.id, req, resource: 'User', resourceId: id, metadata: { status } });
  return { id, status: user.status };
}

async function verifyUser(req: FastifyRequest) {
  const { id } = req.params as { id: string };
  const { profileType, status } = req.body as { profileType?: 'realtor' | 'agent' | 'affiliate'; status?: 'VERIFIED' | 'REJECTED' | 'PENDING' };
  if (!profileType || !status) throw badRequest('profileType and status required');
  let count = 0;
  if (profileType === 'realtor') {
    count = (await prisma.realtorProfile.updateMany({ where: { userId: id }, data: { verification: status as never } })).count;
  } else if (profileType === 'agent') {
    count = (await prisma.agentProfile.updateMany({ where: { userId: id }, data: { verification: status as never } })).count;
  } else {
    count = (await prisma.affiliateProfile.updateMany({ where: { userId: id }, data: { verification: status as never } })).count;
  }
  if (count === 0) throw notFound('Profile not found');
  await audit('ADMIN_VERIFY_USER', { userId: (req.user as { id: string })?.id, req, resource: 'User', resourceId: id, metadata: { profileType, status } });
  return { id, profileType, verification: status };
}

async function approveProperty(req: FastifyRequest) {
  const { id } = req.params as { id: string };
  const { action } = req.body as { action?: 'approve' | 'reject' | 'suspend' | 'verify' | 'feature' };
  if (!action) throw badRequest('action required');
  const updates: Record<string, unknown> = {};
  if (action === 'approve') { updates.status = PropertyStatus.ACTIVE; updates.verification = VerificationStatus.VERIFIED; }
  if (action === 'reject') { updates.status = PropertyStatus.REJECTED; updates.verification = VerificationStatus.REJECTED; }
  if (action === 'suspend') updates.status = PropertyStatus.ARCHIVED;
  if (action === 'verify') updates.verification = VerificationStatus.VERIFIED;
  if (action === 'feature') updates.featured = true;
  const property = await prisma.property.update({ where: { id }, data: updates as never });
  await audit('ADMIN_PROPERTY_ACTION', { userId: (req.user as { id: string })?.id, req, resource: 'Property', resourceId: id, metadata: { action } });
  return { id, status: property.status, verification: property.verification, featured: property.featured };
}

async function listPropertiesAdmin(req: FastifyRequest) {
  const { status, page = 1, pageSize = 20 } = (req.query as { status?: string; page?: number; pageSize?: number }) ?? {};
  const where = status ? { status: status as never } : {};
  const [items, total] = await Promise.all([
    prisma.property.findMany({ where, include: { owner: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.property.count({ where }),
  ]);
  return { items: items.map((p) => ({ ...p, priceMinor: p.priceMinor.toString() })), total, page, pageSize, hasNext: page * pageSize < total };
}

const updateSettingSchema = z.object({ key: z.string().min(1), value: z.string() });

async function updateSetting(req: FastifyRequest) {
  const input = updateSettingSchema.parse(req.body);
  await setSetting(input.key, input.value);
  await audit('ADMIN_SETTING_UPDATE', { userId: (req.user as { id: string })?.id, req, metadata: { key: input.key } });
  return { key: input.key, value: await getSettingString(input.key) };
}

async function listSettings(req: FastifyRequest) {
  const settings = await prisma.platformSetting.findMany();
  return { items: settings.map((s) => ({ key: s.key, value: s.value })) };
}

const createPlanSchema = z.object({
  name: z.string().min(2),
  price: z.number().positive(),
  currency: z.string().default('NGN'),
  billingCycleDays: z.number().int().positive(),
  description: z.string().optional(),
});

async function createPlan(req: FastifyRequest) {
  const input = createPlanSchema.parse(req.body);
  const plan = await prisma.subscriptionPlan.create({
    data: { name: input.name, priceMinor: BigInt(toMinor(input.price)), currency: input.currency, billingCycleDays: input.billingCycleDays, description: input.description },
  });
  return { id: plan.id, name: plan.name, priceMinor: plan.priceMinor.toString() };
}

async function financials(req: FastifyRequest) {
  const [txVolume, deposits, withdrawals, linkpointCommission, agentPayouts, affiliatePayouts, adSpend] = await Promise.all([
    prisma.transaction.aggregate({ where: { status: 'COMPLETED' }, _sum: { amountMinor: true } }),
    prisma.walletTransaction.aggregate({ where: { type: 'DEPOSIT', status: 'COMPLETED' }, _sum: { amountMinor: true } }),
    prisma.walletTransaction.aggregate({ where: { type: 'WITHDRAWAL', status: 'COMPLETED' }, _sum: { amountMinor: true } }),
    prisma.walletTransaction.aggregate({ where: { type: 'COMMISSION', source: 'TRANSACTION', status: 'COMPLETED' }, _sum: { amountMinor: true } }),
    prisma.walletTransaction.aggregate({ where: { type: 'COMMISSION', source: 'INSPECTION', status: 'COMPLETED' }, _sum: { amountMinor: true } }),
    prisma.walletTransaction.aggregate({ where: { type: 'COMMISSION', source: 'AFFILIATE', status: 'COMPLETED' }, _sum: { amountMinor: true } }),
    prisma.advertisement.aggregate({ where: { status: 'ACTIVE' }, _sum: { spentMinor: true } }),
  ]);
  return {
    transactionVolumeMinor: txVolume._sum.amountMinor?.toString() ?? '0',
    totalDepositsMinor: deposits._sum.amountMinor?.toString() ?? '0',
    totalWithdrawalsMinor: withdrawals._sum.amountMinor?.toString() ?? '0',
    linkpointCommissionMinor: linkpointCommission._sum.amountMinor?.toString() ?? '0',
    agentPayoutsMinor: agentPayouts._sum.amountMinor?.toString() ?? '0',
    affiliatePayoutsMinor: affiliatePayouts._sum.amountMinor?.toString() ?? '0',
    adSpendMinor: adSpend._sum.spentMinor?.toString() ?? '0',
  };
}

async function moderationEvents(req: FastifyRequest) {
  const { state } = (req.query as { state?: string }) ?? {};
  const items = await prisma.moderationEvent.findMany({
    where: state ? { state: state as never } : {},
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return { items };
}

async function reports(req: FastifyRequest) {
  const items = await prisma.report.findMany({ orderBy: { createdAt: 'desc' } });
  return { items };
}

async function stats() {
  const [users, properties, inspections, transactions, txVolume] = await Promise.all([
    prisma.user.count(),
    prisma.property.count(),
    prisma.inspection.count(),
    prisma.transaction.count(),
    prisma.transaction.aggregate({ where: { status: 'COMPLETED' }, _sum: { amountMinor: true } }),
  ]);
  return {
    users: { total: users },
    properties: { total: properties },
    inspections: { total: inspections },
    transactions: { total: transactions, volume: txVolume._sum.amountMinor?.toString() ?? '0' },
  };
}

async function listInspections(req: FastifyRequest) {
  const { status, page = 1, pageSize = 20 } = (req.query as { status?: string; page?: number; pageSize?: number }) ?? {};
  const where = status ? { status: status as never } : {};
  const [items, total] = await Promise.all([
    prisma.inspection.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        agent: { select: { user: { select: { name: true } } } },
        property: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.inspection.count({ where }),
  ]);
  return {
    items: items.map((i) => ({
      id: i.id,
      status: i.status,
      fee: i.feeMinor.toString(),
      agentCommission: i.agentCommissionMinor.toString(),
      createdAt: i.createdAt,
      customerName: i.customer?.name ?? '—',
      agentName: i.agent?.user?.name ?? null,
      propertyTitle: i.property?.title ?? '—',
    })),
    total,
    page,
    pageSize,
    hasNext: page * pageSize < total,
  };
}

async function listWallets(req: FastifyRequest) {
  const { page = 1, pageSize = 20 } = (req.query as { page?: number; pageSize?: number }) ?? {};
  const [items, total] = await Promise.all([
    prisma.wallet.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.wallet.count(),
  ]);
  return {
    items: items.map((w) => ({
      id: w.id,
      user: w.user,
      balance: w.balanceMinor.toString(),
      pendingBalance: w.pendingMinor.toString(),
      currency: w.currency,
    })),
    total,
    page,
    pageSize,
    hasNext: page * pageSize < total,
  };
}

async function listTransactions(req: FastifyRequest) {
  const { status, page = 1, pageSize = 20 } = (req.query as { status?: string; page?: number; pageSize?: number }) ?? {};
  const where = status ? { status: status as never } : {};
  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        buyer: { select: { name: true } },
        seller: { select: { name: true } },
        property: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);
  return {
    items: items.map((t) => ({
      id: t.id,
      reference: t.id,
      status: t.status,
      amount: t.amountMinor.toString(),
      currency: t.currency,
      linkpointCommission: t.linkpointCommissionMinor.toString(),
      createdAt: t.createdAt,
      buyerName: t.buyer?.name ?? null,
      sellerName: t.seller?.name ?? null,
      propertyTitle: t.property?.title ?? '—',
    })),
    total,
    page,
    pageSize,
    hasNext: page * pageSize < total,
  };
}

export function registerAdminRoutes(app: FastifyInstance, prefix: string): void {
  const adminGuard = async (req: FastifyRequest) => {
    if (!req.user || !(req.user.roles as string[]).includes('ADMIN')) {
      throw forbidden('Admin access required');
    }
  };
  app.get(`${prefix}/admin/stats`, { preHandler: [app.authenticate, adminGuard], handler: stats as never });
  app.get(`${prefix}/admin/users`, { preHandler: [app.authenticate, adminGuard], handler: listUsers as never });
  app.patch(`${prefix}/admin/users/:id/status`, { preHandler: [app.authenticate, adminGuard], handler: setUserStatus as never });
  app.post(`${prefix}/admin/users/:id/verify`, { preHandler: [app.authenticate, adminGuard], handler: verifyUser as never });
  app.get(`${prefix}/admin/properties`, { preHandler: [app.authenticate, adminGuard], handler: listPropertiesAdmin as never });
  app.post(`${prefix}/admin/properties/:id/action`, { preHandler: [app.authenticate, adminGuard], handler: approveProperty as never });
  app.get(`${prefix}/admin/inspections`, { preHandler: [app.authenticate, adminGuard], handler: listInspections as never });
  app.get(`${prefix}/admin/wallets`, { preHandler: [app.authenticate, adminGuard], handler: listWallets as never });
  app.get(`${prefix}/admin/transactions`, { preHandler: [app.authenticate, adminGuard], handler: listTransactions as never });
  app.get(`${prefix}/admin/settings`, { preHandler: [app.authenticate, adminGuard], handler: listSettings as never });
  app.patch(`${prefix}/admin/settings`, { preHandler: [app.authenticate, adminGuard], handler: updateSetting as never });
  app.post(`${prefix}/admin/plans`, { preHandler: [app.authenticate, adminGuard], handler: createPlan as never });
  app.get(`${prefix}/admin/financials`, { preHandler: [app.authenticate, adminGuard], handler: financials as never });
  app.get(`${prefix}/admin/moderation`, { preHandler: [app.authenticate, adminGuard], handler: moderationEvents as never });
  app.get(`${prefix}/admin/reports`, { preHandler: [app.authenticate, adminGuard], handler: reports as never });
}
