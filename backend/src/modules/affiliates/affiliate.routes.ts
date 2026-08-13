import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound, parseOr400, unauthorized } from '../../lib/errors';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { audit } from '../../lib/audit';

// Browse eligible properties for affiliate participation.
async function browseAffiliateProperties(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const affiliate = await prisma.affiliateProfile.findUnique({ where: { userId: req.user.id } });
  if (!affiliate) throw notFound('Affiliate profile not found');
  const items = await prisma.property.findMany({
    where: { affiliateEnabled: true, status: 'ACTIVE' },
    select: {
      id: true, title: true, city: true, state: true, priceMinor: true, currency: true,
      affiliateCommissionPct: true, media: true, propertyType: true,
    },
  });
  return {
    items: items.map((p) => ({ ...p, priceMinor: p.priceMinor.toString(), priceMajor: Number(p.priceMinor) / 100 })),
  };
}

const generateLinkSchema = z.object({ propertyId: z.string().uuid() });

async function generateLink(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const input = parseOr400(generateLinkSchema, req.body);
  const affiliate = await prisma.affiliateProfile.findUnique({ where: { userId: req.user.id } });
  if (!affiliate) throw notFound('Affiliate profile not found');
  const property = await prisma.property.findUnique({ where: { id: input.propertyId } });
  if (!property) throw notFound('Property not found');
  if (!property.affiliateEnabled) throw badRequest('Property does not allow affiliates');
  const pct = property.affiliateCommissionPct;
  if (pct == null || pct < 4 || pct > 6) throw badRequest('Invalid affiliate commission on property');

  // Reuse an existing link for this affiliate+property if present.
  const existing = await prisma.affiliateLink.findFirst({
    where: { affiliateId: affiliate.id, propertyId: input.propertyId, active: true },
  });
  if (existing) return { slug: existing.slug, url: `linkpoint://property/${input.propertyId}?ref=${existing.slug}` };

  const link = await prisma.affiliateLink.create({
    data: {
      affiliateId: affiliate.id,
      propertyId: input.propertyId,
      slug: nanoid(12),
      commissionPct: pct,
    },
  });
  await audit('AFFILIATE_LINK_CREATE', { userId: req.user.id, req, resource: 'AffiliateLink', resourceId: link.id });
  return { slug: link.slug, url: `linkpoint://property/${input.propertyId}?ref=${link.slug}` };
}

async function myLinks(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const affiliate = await prisma.affiliateProfile.findUnique({ where: { userId: req.user.id } });
  if (!affiliate) throw notFound('Affiliate profile not found');
  const items = await prisma.affiliateLink.findMany({
    where: { affiliateId: affiliate.id },
    include: {
      property: { select: { id: true, title: true, priceMinor: true, currency: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return {
    items: items.map((l) => ({
      ...l,
      property: l.property ? { ...l.property, priceMinor: l.property.priceMinor.toString() } : null,
    })),
  };
}

async function dashboard(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const affiliate = await prisma.affiliateProfile.findUnique({ where: { userId: req.user.id } });
  if (!affiliate) throw notFound('Affiliate profile not found');

  const links = await prisma.affiliateLink.findMany({ where: { affiliateId: affiliate.id } });
  const totalClicks = links.reduce((sum, l) => sum + l.clicks, 0);
  const completedDeals = await prisma.transaction.count({
    where: { affiliateLinkId: { in: links.map((l) => l.id) }, status: 'COMPLETED' },
  });
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });

  return {
    totalClicks,
    activeLinks: links.length,
    completedDeals,
    availableBalanceMinor: wallet?.balanceMinor.toString() ?? '0',
    pendingBalanceMinor: wallet?.pendingMinor.toString() ?? '0',
    currency: wallet?.currency ?? 'NGN',
  };
}

// Resolve an affiliate ref slug (used on deep-link entry for secure attribution).
async function resolveRef(req: FastifyRequest) {
  const { ref, propertyId } = (req.query as { ref?: string; propertyId?: string }) ?? {};
  if (!ref) throw badRequest('ref required');
  const link = await prisma.affiliateLink.findFirst({
    where: { slug: ref, active: true },
    include: { affiliate: true },
  });
  if (!link) throw notFound('Invalid affiliate link');

  // Record click (real analytics only).
  await prisma.affiliateLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } });

  return {
    affiliateId: link.affiliateId,
    affiliateLinkId: link.id,
    propertyId: link.propertyId ?? propertyId,
    commissionPct: link.commissionPct,
  };
}

export function registerAffiliateRoutes(app: FastifyInstance, prefix: string): void {
  app.get(`${prefix}/affiliates/resolve`, { handler: resolveRef as never });
  app.get(`${prefix}/affiliates/dashboard`, { preHandler: app.authenticate, handler: dashboard as never });
  app.get(`${prefix}/affiliates/properties`, { preHandler: app.authenticate, handler: browseAffiliateProperties as never });
  app.post(`${prefix}/affiliates/links`, { preHandler: app.authenticate, handler: generateLink as never });
  app.get(`${prefix}/affiliates/links`, { preHandler: app.authenticate, handler: myLinks as never });
}
