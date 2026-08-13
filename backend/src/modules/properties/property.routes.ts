import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound, parseOr400 } from '../../lib/errors';
import { createPropertySchema, searchPropertiesSchema } from '@linkpoint/validation';
import { PropertyStatus, VerificationStatus } from '../../../prisma/generated/client';
import { UserRole } from '@linkpoint/types';
import { toMinor } from '@linkpoint/shared';
import { audit } from '../../lib/audit';
import { thumbnailUrl } from '../../lib/cloudinary';

// Only subscribed + approved realtors/property owners can publish listings.
async function canListProperty(userId: string): Promise<boolean> {
  const realtor = await prisma.realtorProfile.findUnique({ where: { userId } });
  if (!realtor || !realtor.active) return false;
  if (realtor.verification !== VerificationStatus.VERIFIED) return false;
  // active listing member requires an active subscription
  const sub = await prisma.subscription.findFirst({
    where: { userId, status: 'ACTIVE', expireAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  return !!sub;
}

async function createProperty(req: FastifyRequest) {
  if (!req.user) throw badRequest('Authentication required');
  const input = parseOr400(createPropertySchema, req.body);

  // Enforce affiliate commission range (4..6) server-side.
  if (input.affiliateEnabled) {
    if (input.affiliateCommissionPct == null) throw badRequest('Affiliate commission required when affiliate enabled');
    if (input.affiliateCommissionPct < 4 || input.affiliateCommissionPct > 6) {
      throw badRequest('Affiliate commission must be between 4% and 6%');
    }
  }

  const allowed = await canListProperty(req.user.id);
  if (!allowed) {
    throw forbidden('Only active subscribed and verified realtors/owners can list properties');
  }

  const property = await prisma.property.create({
    data: {
      ownerId: req.user.id,
      title: input.title,
      description: input.description,
      propertyType: input.propertyType as never,
      purpose: input.purpose as never,
      priceMinor: BigInt(toMinor(input.price)),
      currency: input.currency,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      landSize: input.landSize,
      buildingSize: input.buildingSize,
      amenities: input.amenities as never,
      media: input.media as never,
      videos: input.videos as never,
      latitude: input.latitude,
      longitude: input.longitude,
      exactAddress: input.exactAddress, // PROTECTED — never returned to customers
      city: input.city,
      state: input.state,
      country: input.country,
      area: input.area,
      status: PropertyStatus.DRAFT,
      affiliateEnabled: input.affiliateEnabled,
      affiliateCommissionPct: input.affiliateEnabled ? input.affiliateCommissionPct : null,
    },
  });
  await audit('PROPERTY_CREATE', { userId: req.user.id, req, resource: 'Property', resourceId: property.id });
  return { id: property.id, status: property.status, message: 'Property created as draft. Submit for review to publish.' };
}

async function submitForReview(req: FastifyRequest) {
  if (!req.user) throw badRequest('Authentication required');
  const { id } = req.params as { id: string };
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) throw notFound('Property not found');
  if (property.ownerId !== req.user.id) throw forbidden('Not the owner');
  if (property.status !== PropertyStatus.DRAFT && property.status !== PropertyStatus.REJECTED) {
    throw badRequest('Property cannot be submitted from its current status');
  }
  const updated = await prisma.property.update({
    where: { id },
    data: { status: PropertyStatus.PENDING_REVIEW, verification: VerificationStatus.PENDING },
  });
  await audit('PROPERTY_SUBMIT_REVIEW', { userId: req.user.id, req, resource: 'Property', resourceId: id });
  return { id, status: updated.status };
}

/**
 * Public property serializer that PROTECTS the exact address.
 * Customers see city/state/area + approximate coordinates only.
 * Realtor contact is hidden — only a LinkPoint-safe profile name.
 */
function publicProperty(p: {
  id: string;
  title: string;
  description: string;
  propertyType: string;
  purpose: string;
  priceMinor: bigint;
  currency: string;
  bedrooms: number;
  bathrooms: number;
  landSize: number | null;
  buildingSize: number | null;
  amenities: unknown;
  media: unknown;
  videos: unknown;
  latitude: number;
  longitude: number;
  city: string;
  state: string;
  country: string;
  area: string | null;
  status: string;
  verification: string;
  affiliateEnabled: boolean;
  affiliateCommissionPct: number | null;
  featured: boolean;
  viewCount: number;
  saveCount: number;
  completedInspectionCount: number;
  createdAt: Date;
  owner?: { name: string } | null;
}) {
  const media = (p.media as string[]) ?? [];
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    propertyType: p.propertyType,
    purpose: p.purpose,
    priceMinor: p.priceMinor.toString(),
    priceMajor: Number(p.priceMinor) / 100,
    currency: p.currency,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    landSize: p.landSize,
    buildingSize: p.buildingSize,
    amenities: p.amenities,
    media: media.map(thumbnailUrl),
    videos: p.videos,
    // Approximate location only — exact address PROTECTED.
    latitude: roundApprox(p.latitude),
    longitude: roundApprox(p.longitude),
    city: p.city,
    state: p.state,
    country: p.country,
    area: p.area,
    exactAddress: undefined, // never exposed to customers
    status: p.status,
    verification: p.verification,
    affiliateEnabled: p.affiliateEnabled,
    affiliateCommissionPct: p.affiliateEnabled ? p.affiliateCommissionPct : null,
    featured: p.featured,
    viewCount: p.viewCount,
    saveCount: p.saveCount,
    completedInspectionCount: p.completedInspectionCount,
    // Realtor contact details NEVER exposed — only a controlled display name.
    ownerName: p.owner?.name ?? 'LinkPoint Verified Lister',
    ownerPhone: undefined,
    ownerEmail: undefined,
    createdAt: p.createdAt,
  };
}

// Round coordinates to ~1km precision to obscure exact address while keeping map usefulness.
function roundApprox(coord: number): number {
  return Math.round(coord * 100) / 100;
}

async function listProperties(req: FastifyRequest) {
  const input = parseOr400(searchPropertiesSchema, req.query);
  const page = Number(input.page) || 1;
  const pageSize = Number(input.pageSize) || 20;
  const where = {
    status: PropertyStatus.ACTIVE,
    ...(input.city ? { city: { contains: input.city } } : {}),
    ...(input.state ? { state: { contains: input.state } } : {}),
    ...(input.propertyType ? { propertyType: input.propertyType as never } : {}),
    ...(input.purpose ? { purpose: input.purpose as never } : {}),
    ...(input.verified ? { verification: VerificationStatus.VERIFIED } : {}),
    ...(input.featured ? { featured: true } : {}),
    ...(input.minPrice || input.maxPrice
      ? {
          priceMinor: {
            ...(input.minPrice ? { gte: BigInt(toMinor(input.minPrice)) } : {}),
            ...(input.maxPrice ? { lte: BigInt(toMinor(input.maxPrice)) } : {}),
          },
        }
      : {}),
    ...(input.bedrooms ? { bedrooms: { gte: input.bedrooms } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: { owner: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.property.count({ where }),
  ]);
  return {
    items: items.map((p) => publicProperty({ ...p, propertyType: p.propertyType, purpose: p.purpose, status: p.status, verification: p.verification })),
    total,
    page,
    pageSize,
    hasNext: page * pageSize < total,
  };
}

async function getProperty(req: FastifyRequest) {
  const { id } = req.params as { id: string };
  const property = await prisma.property.findUnique({
    where: { id },
    include: { owner: { select: { name: true, roles: true } } },
  });
  if (!property) throw notFound('Property not found');
  // Increment view count (real analytics — not fabricated).
  await prisma.property.update({ where: { id }, data: { viewCount: { increment: 1 } } });

  // Determine if the requester is the assigned inspection agent for this property.
  // Only the assigned agent (and owner/admin) may see the exact address.
  let canSeeExact = false;
  if (req.user) {
    if (property.ownerId === req.user.id) canSeeExact = true;
    if ((req.user.roles as string[]).includes(UserRole.ADMIN)) canSeeExact = true;
    if ((req.user.roles as string[]).includes(UserRole.INSPECTION_AGENT)) {
      const assigned = await prisma.inspection.findFirst({
        where: { propertyId: id, customerId: req.user.id, status: { in: ['ASSIGNED', 'ACCEPTED', 'SCHEDULED', 'EN_ROUTE', 'STARTED', 'COMPLETED'] } },
      });
      if (assigned) canSeeExact = true;
    }
  }

  const base = publicProperty({ ...property, propertyType: property.propertyType, purpose: property.purpose, status: property.status, verification: property.verification, owner: property.owner ? { name: property.owner.name } : null });
  if (canSeeExact) {
    return { ...base, exactAddress: property.exactAddress, latitude: property.latitude, longitude: property.longitude };
  }
  return base;
}

async function getMyProperties(req: FastifyRequest) {
  if (!req.user) throw badRequest('Authentication required');
  const items = await prisma.property.findMany({
    where: { ownerId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });
  // Owners see their own exact address and full analytics.
  return {
    items: items.map((p) => ({
      ...publicProperty({ ...p, propertyType: p.propertyType, purpose: p.purpose, status: p.status, verification: p.verification, owner: { name: p.ownerId } }),
      exactAddress: p.exactAddress,
      latitude: p.latitude,
      longitude: p.longitude,
      inquiryCount: p.inquiryCount,
      inspectionRequestCount: p.inspectionRequestCount,
    })),
  };
}

async function updatePropertyStatus(req: FastifyRequest) {
  if (!req.user) throw badRequest('Authentication required');
  const { id } = req.params as { id: string };
  const { status } = req.body as { status?: string };
  if (!status) throw badRequest('status required');
  const allowed = ['PAUSED', 'ACTIVE', 'ARCHIVED'];
  if (!allowed.includes(status)) throw badRequest('Invalid status for owner action');
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) throw notFound('Property not found');
  if (property.ownerId !== req.user.id) throw forbidden('Not the owner');
  if (property.status === PropertyStatus.SOLD || property.status === PropertyStatus.RENTED) {
    throw badRequest('Property already sold/rented');
  }
  const updated = await prisma.property.update({
    where: { id },
    data: { status: status as never },
  });
  await audit('PROPERTY_UPDATE_STATUS', { userId: req.user.id, req, resource: 'Property', resourceId: id, metadata: { status } });
  return { id, status: updated.status };
}

async function markSoldOrRented(req: FastifyRequest) {
  if (!req.user) throw badRequest('Authentication required');
  const { id } = req.params as { id: string };
  const { status } = req.body as { status?: string };
  if (status !== 'SOLD' && status !== 'RENTED') throw badRequest('Use SOLD or RENTED');
  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) throw notFound('Property not found');
  if (property.ownerId !== req.user.id) throw forbidden('Not the owner');
  const updated = await prisma.property.update({ where: { id }, data: { status: status as never } });
  await audit(`PROPERTY_${status}`, { userId: req.user.id, req, resource: 'Property', resourceId: id });
  return { id, status: updated.status };
}

export function registerPropertyRoutes(app: FastifyInstance, prefix: string): void {
  app.post(`${prefix}/properties`, { preHandler: app.authenticate, handler: createProperty as never });
  app.get(`${prefix}/properties`, { handler: listProperties as never });
  app.get(`${prefix}/properties/:id`, { handler: getProperty as never });
  app.get(`${prefix}/properties/me/owner`, { preHandler: app.authenticate, handler: getMyProperties as never });
  app.post(`${prefix}/properties/:id/submit`, { preHandler: app.authenticate, handler: submitForReview as never });
  app.patch(`${prefix}/properties/:id/status`, { preHandler: app.authenticate, handler: updatePropertyStatus as never });
  app.post(`${prefix}/properties/:id/:status`, { preHandler: app.authenticate, handler: markSoldOrRented as never });
}
