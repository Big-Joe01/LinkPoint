import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound, unauthorized } from '../../lib/errors';
import { SubscriptionStatus } from '../../../prisma/generated/client';
import { initializePayment } from '../../lib/flutterwave';
import { audit } from '../../lib/audit';

async function listPlans(req: FastifyRequest) {
  return prisma.subscriptionPlan.findMany({ where: { active: true }, orderBy: { priceMinor: 'asc' } });
}

async function mySubscription(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const sub = await prisma.subscription.findFirst({
    where: { userId: req.user.id },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!sub) return { active: false };
  const active = sub.status === SubscriptionStatus.ACTIVE && sub.expireAt && sub.expireAt > new Date();
  return { ...sub, active, priceMinor: sub.plan.priceMinor.toString() };
}

async function subscribe(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { planId } = req.body as { planId?: string };
  if (!planId) throw badRequest('planId required');
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: planId } });
  if (!plan) throw notFound('Plan not found');

  // Create PENDING subscription. Activated only after Flutterwave webhook confirms payment.
  const sub = await prisma.subscription.create({
    data: {
      userId: req.user.id,
      planId: plan.id,
      status: SubscriptionStatus.PENDING,
    },
  });
  const init = await initializePayment({
    amount: Number(plan.priceMinor) / 100,
    currency: plan.currency,
    customerEmail: (await prisma.user.findUnique({ where: { id: req.user.id } }))?.email ?? '',
    customerName: '',
    customerPhone: '',
    txRef: `SUB-${sub.id}`,
    isBankTransfer: true,
    metadata: { subscriptionId: sub.id, purpose: 'SUBSCRIPTION' },
  });
  await audit('SUBSCRIPTION_INIT', { userId: req.user.id, req, resource: 'Subscription', resourceId: sub.id });
  return { subscriptionId: sub.id, paymentLink: init.paymentLink, virtualAccount: init.virtualAccount };
}

async function cancelSubscription(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const sub = await prisma.subscription.findFirst({
    where: { userId: req.user.id, status: SubscriptionStatus.ACTIVE },
    orderBy: { createdAt: 'desc' },
  });
  if (!sub) throw notFound('No active subscription');
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { autoRenew: false, cancelledAt: new Date() },
  });
  await audit('SUBSCRIPTION_CANCEL', { userId: req.user.id, req, resource: 'Subscription', resourceId: sub.id });
  return { message: 'Subscription will not renew' };
}

export function registerSubscriptionRoutes(app: FastifyInstance, prefix: string): void {
  app.get(`${prefix}/subscriptions/plans`, { handler: listPlans as never });
  app.get(`${prefix}/subscriptions/me`, { preHandler: app.authenticate, handler: mySubscription as never });
  app.post(`${prefix}/subscriptions`, { preHandler: app.authenticate, handler: subscribe as never });
  app.post(`${prefix}/subscriptions/cancel`, { preHandler: app.authenticate, handler: cancelSubscription as never });
}
