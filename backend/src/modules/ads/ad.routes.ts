import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound, parseOr400, unauthorized } from '../../lib/errors';
import { createAdCampaignSchema } from '@linkpoint/validation';
import { AdStatus } from '../../../prisma/generated/client';
import { toMinor } from '@linkpoint/shared';
import { initializePayment } from '../../lib/flutterwave';
import { audit } from '../../lib/audit';
import { nanoid } from 'nanoid';

async function createCampaign(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const input = parseOr400(createAdCampaignSchema, req.body);

  const property = await prisma.property.findUnique({ where: { id: input.propertyId } });
  if (!property) throw notFound('Property not found');
  if (property.ownerId !== req.user.id) throw forbidden('Not the property owner');

  const media = (property.media as string[]) ?? [];
  const mediaUrl = media[0] ?? '';
  if (!mediaUrl) throw badRequest('Property has no media for ad creative');

  const budgetMinor = BigInt(toMinor(input.budget));
  const campaign = await prisma.advertisement.create({
    data: {
      advertiserId: req.user.id,
      propertyId: input.propertyId,
      adType: input.type ?? 'IMAGE',
      mediaUrl,
      objective: input.objective,
      budgetMinor,
      durationDays: input.durationDays,
      status: AdStatus.PENDING_PAYMENT,
      paymentRef: `AD-${nanoid(12)}`,
    },
  });
  await audit('AD_CREATE', { userId: req.user.id, req, resource: 'Advertisement', resourceId: campaign.id });
  return { id: campaign.id, status: campaign.status, paymentRef: campaign.paymentRef };
}

async function payCampaign(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { id } = req.params as { id: string };
  const campaign = await prisma.advertisement.findUnique({ where: { id } });
  if (!campaign) throw notFound('Campaign not found');
  if (campaign.advertiserId !== req.user.id) throw forbidden('Not the advertiser');
  if (campaign.status !== AdStatus.PENDING_PAYMENT) throw badRequest('Campaign not awaiting payment');

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const txRef = campaign.paymentRef ?? `AD-${nanoid(12)}`;
  const init = await initializePayment({
    amount: Number(campaign.budgetMinor) / 100,
    currency: 'NGN',
    customerEmail: user?.email ?? '',
    customerName: user?.name ?? '',
    customerPhone: user?.phone ?? '',
    txRef,
    isBankTransfer: true,
    metadata: { campaignId: campaign.id, purpose: 'AD_PAYMENT' },
  });
  return { paymentRef: campaign.paymentRef, paymentLink: init.paymentLink, virtualAccount: init.virtualAccount };
}

async function myCampaigns(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const items = await prisma.advertisement.findMany({
    where: { advertiserId: req.user.id },
    include: { property: { select: { title: true, media: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return {
    items: items.map((c) => ({
      ...c,
      budgetMinor: c.budgetMinor.toString(),
      budgetMajor: Number(c.budgetMinor) / 100,
      spentMinor: c.spentMinor.toString(),
    })),
  };
}

async function activeAds(req: FastifyRequest) {
  const { page = 1, pageSize = 10 } = (req.query as { page?: number; pageSize?: number }) ?? {};
  const [items, total] = await Promise.all([
    prisma.advertisement.findMany({
      where: { status: AdStatus.ACTIVE },
      include: { property: { select: { id: true, title: true, media: true, videos: true, priceMinor: true, currency: true, city: true, state: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.advertisement.count({ where: { status: AdStatus.ACTIVE } }),
  ]);
  return {
    items: items.map((c) => ({
      ...c,
      property: c.property ? { ...c.property, priceMinor: c.property.priceMinor.toString() } : null,
    })),
    total,
    page,
    pageSize,
  };
}

async function trackImpression(req: FastifyRequest) {
  const { id } = req.params as { id: string };
  await prisma.advertisement.update({ where: { id }, data: { impressions: { increment: 1 } } });
  return { ok: true };
}

async function trackClick(req: FastifyRequest) {
  const { id } = req.params as { id: string };
  await prisma.advertisement.update({ where: { id }, data: { clicks: { increment: 1 } } });
  return { ok: true };
}

export function registerAdRoutes(app: FastifyInstance, prefix: string): void {
  app.post(`${prefix}/ads`, { preHandler: app.authenticate, handler: createCampaign as never });
  app.get(`${prefix}/ads`, { handler: activeAds as never });
  app.get(`${prefix}/ads/me`, { preHandler: app.authenticate, handler: myCampaigns as never });
  app.post(`${prefix}/ads/:id/pay`, { preHandler: app.authenticate, handler: payCampaign as never });
  app.post(`${prefix}/ads/:id/impression`, { handler: trackImpression as never });
  app.post(`${prefix}/ads/:id/click`, { handler: trackClick as never });
}
