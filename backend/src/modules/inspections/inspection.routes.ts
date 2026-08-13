import { FastifyInstance, FastifyRequest } from 'fastify';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound, parseOr400, unauthorized } from '../../lib/errors';
import { bookInspectionSchema } from '@linkpoint/validation';
import { InspectionStatus, PropertyStatus, WalletTxnStatus, WalletTxnType } from '../../../prisma/generated/client';
import { calculateInspectionFee, rankAgentsByProximityToProperty, computeAgentCommission } from './inspection.service';
import { debitWallet, creditWallet } from '../../lib/wallet-ledger';
import { toMinor } from '@linkpoint/shared';
import { audit } from '../../lib/audit';
import { nanoid } from 'nanoid';
import { getSetting } from '../../lib/settings';

async function bookInspection(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const userId = req.user.id;
  const input = parseOr400(bookInspectionSchema, req.body);

  const property = await prisma.property.findUnique({ where: { id: input.propertyId } });
  if (!property) throw notFound('Property not found');
  if (property.status !== PropertyStatus.ACTIVE) throw badRequest('Property is not available for inspection');

  // Customer pays LinkPoint (NOT the realtor). Calculate fee dynamically.
  const fee = await calculateInspectionFee({
    propertyLatitude: property.latitude,
    propertyLongitude: property.longitude,
    propertyType: property.propertyType,
  });

  // Create inspection record first (need its id to reference the wallet transaction).
  const inspection = await prisma.inspection.create({
    data: {
      propertyId: property.id,
      customerId: userId,
      status: InspectionStatus.SEARCHING,
      feeMinor: fee.feeMinor,
      currency: property.currency,
      preferredDate: new Date(input.preferredDate),
      preferredTime: input.preferredTime,
      notes: input.notes,
    },
  });

  // Debit customer wallet for the inspection fee. If insufficient balance, the
  // customer must fund the wallet first — we reject with a clear error and the
  // inspection stays in SEARCHING/pending-payment until paid.
  const reference = `INS-${inspection.id}`;
  const wallet = await prisma.wallet.findUnique({ where: { userId: req.user.id } });
  if (!wallet) {
    await prisma.inspection.delete({ where: { id: inspection.id } });
    throw notFound('Wallet not found');
  }
  if (wallet.balanceMinor < fee.feeMinor) {
    await prisma.inspection.update({ where: { id: inspection.id }, data: { status: InspectionStatus.REQUESTED } });
    throw badRequest(
      `Inspection fee is ₦${Number(fee.feeMinor) / 100}. Insufficient wallet balance. Fund your wallet first.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await debitWallet(
      {
        userId: req.user.id,
        amountMinor: fee.feeMinor,
        reference,
        type: WalletTxnType.PAYMENT,
        source: 'INSPECTION',
        status: WalletTxnStatus.COMPLETED,
        metadata: { inspectionId: inspection.id, breakdown: fee.breakdown },
      },
      tx,
    );
    // link the wallet transaction to the inspection
    await tx.walletTransaction.update({
      where: { reference },
      data: { inspectionId: inspection.id },
    });
  });

  await prisma.property.update({
    where: { id: property.id },
    data: { inspectionRequestCount: { increment: 1 } },
  });
  await audit('INSPECTION_BOOK', { userId: req.user.id, req, resource: 'Inspection', resourceId: inspection.id });

  // Assign nearest suitable agent (proximity to PROPERTY, not customer).
  const ranked = await rankAgentsByProximityToProperty({ latitude: property.latitude, longitude: property.longitude });
  let assignedAgentId: string | null = null;
  if (ranked.length > 0) {
    const best = ranked[0];
    assignedAgentId = best.agent.id;
    const commission = await computeAgentCommission(fee.feeMinor);
    await prisma.inspection.update({
      where: { id: inspection.id },
      data: {
        agentId: best.agent.id,
        status: InspectionStatus.ASSIGNED,
        agentCommissionMinor: commission.commissionMinor,
      },
    });
    await prisma.agentProfile.update({
      where: { id: best.agent.id },
      data: { activeJobs: { increment: 1 } },
    });
    await audit('INSPECTION_AGENT_ASSIGNED', {
      userId: req.user.id,
      req,
      resource: 'Inspection',
      resourceId: inspection.id,
      metadata: { agentId: best.agent.id, distanceKm: best.distanceKm },
    });
  }

  return {
    inspectionId: inspection.id,
    feeMajor: Number(fee.feeMinor) / 100,
    currency: property.currency,
    status: assignedAgentId ? InspectionStatus.ASSIGNED : InspectionStatus.SEARCHING,
    breakdown: fee.breakdown,
  };
}

/**
 * Full property information for the ASSIGNED agent — including the exact address.
 * This is the one place customers' protected data is revealed, and only to the
 * assigned inspection agent, so they can conduct the tour.
 */
async function getInspectionForAgent(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { id } = req.params as { id: string };
  const inspection = await prisma.inspection.findUnique({
    where: { id },
    include: {
      property: true,
      customer: { select: { id: true, name: true } },
      agent: true,
    },
  });
  if (!inspection) throw notFound('Inspection not found');

  // Only the assigned agent (or admin) sees the exact address + full property info.
  const isAssignedAgent =
    inspection.agentId != null &&
    inspection.agent != null &&
    inspection.agent.userId === req.user.id;
  const isAdmin = (req.user.roles as string[]).includes('ADMIN');
  const isCustomer = inspection.customerId === req.user.id;

  if (!isAssignedAgent && !isAdmin && !isCustomer) throw forbidden('Not authorized for this inspection');

  const property = inspection.property;
  // Customer sees everything EXCEPT exact address (until inspection completed/confirmed).
  const customerCanSeeAddress = isCustomer && inspection.status === InspectionStatus.COMPLETED;

  return {
    id: inspection.id,
    status: inspection.status,
    feeMajor: Number(inspection.feeMinor) / 100,
    agentCommissionMajor: Number(inspection.agentCommissionMinor) / 100,
    currency: inspection.currency,
    preferredDate: inspection.preferredDate,
    preferredTime: inspection.preferredTime,
    scheduledAt: inspection.scheduledAt,
    startedAt: inspection.startedAt,
    completedAt: inspection.completedAt,
    customerConfirmedAt: inspection.customerConfirmedAt,
    agentConfirmedAt: inspection.agentConfirmedAt,
    customer: inspection.customer,
    property: {
      id: property.id,
      title: property.title,
      description: property.description,
      propertyType: property.propertyType,
      purpose: property.purpose,
      priceMajor: Number(property.priceMinor) / 100,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      amenities: property.amenities,
      media: property.media,
      videos: property.videos,
      // Agent + completed-stage customer get the EXACT address.
      exactAddress: isAssignedAgent || isAdmin || customerCanSeeAddress ? property.exactAddress : undefined,
      latitude: isAssignedAgent || isAdmin || customerCanSeeAddress ? property.latitude : Math.round(property.latitude * 100) / 100,
      longitude: isAssignedAgent || isAdmin || customerCanSeeAddress ? property.longitude : Math.round(property.longitude * 100) / 100,
      city: property.city,
      state: property.state,
      area: property.area,
      agentNotes: isAssignedAgent || isAdmin ? inspection.notes : undefined,
      inspectionInstructions: isAssignedAgent || isAdmin ? inspection.agentNotes : undefined,
    },
  };
}

async function agentAcceptInspection(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { id } = req.params as { id: string };
  const inspection = await prisma.inspection.findUnique({ where: { id }, include: { agent: true } });
  if (!inspection) throw notFound('Inspection not found');
  if (!inspection.agent || inspection.agent.userId !== req.user.id) throw forbidden('Not the assigned agent');
  if (inspection.status !== InspectionStatus.ASSIGNED) throw badRequest('Inspection cannot be accepted from this status');

  await prisma.$transaction(async (tx) => {
    await tx.inspection.update({ where: { id }, data: { status: InspectionStatus.ACCEPTED, scheduledAt: new Date() } });
    // update acceptance rate
    const agent = await tx.agentProfile.findUnique({ where: { id: inspection.agentId! } });
    if (agent) {
      const totalAssigned = agent.completedJobs + agent.activeJobs + 1;
      const newRate = ((agent.acceptanceRate * (totalAssigned - 1)) + 100) / totalAssigned;
      await tx.agentProfile.update({ where: { id: agent.id }, data: { acceptanceRate: newRate } });
    }
  });
  await audit('INSPECTION_AGENT_ACCEPT', { userId: req.user.id, req, resource: 'Inspection', resourceId: id });
  return { id, status: InspectionStatus.ACCEPTED };
}

async function startInspection(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { id } = req.params as { id: string };
  const inspection = await prisma.inspection.findUnique({ where: { id }, include: { agent: true } });
  if (!inspection) throw notFound('Inspection not found');
  if (!inspection.agent || inspection.agent.userId !== req.user.id) throw forbidden('Not the assigned agent');
  if (inspection.status !== InspectionStatus.ACCEPTED && inspection.status !== InspectionStatus.SCHEDULED) {
    throw badRequest('Inspection not in a startable state');
  }
  const updated = await prisma.inspection.update({
    where: { id },
    data: { status: InspectionStatus.STARTED, startedAt: new Date() },
  });
  await audit('INSPECTION_STARTED', { userId: req.user.id, req, resource: 'Inspection', resourceId: id });
  return { id, status: updated.status };
}

async function completeInspection(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { id } = req.params as { id: string };
  const inspection = await prisma.inspection.findUnique({ where: { id }, include: { agent: true } });
  if (!inspection) throw notFound('Inspection not found');
  if (!inspection.agent || inspection.agent.userId !== req.user.id) throw forbidden('Not the assigned agent');
  if (inspection.status !== InspectionStatus.STARTED) throw badRequest('Inspection must be STARTED to complete');

  await prisma.inspection.update({
    where: { id },
    data: { status: InspectionStatus.COMPLETED, completedAt: new Date(), agentConfirmedAt: new Date() },
  });
  await audit('INSPECTION_AGENT_COMPLETED', { userId: req.user.id, req, resource: 'Inspection', resourceId: id });
  return { id, status: InspectionStatus.COMPLETED, message: 'Awaiting customer confirmation.' };
}

/**
 * Customer confirms completion. ONLY after this confirmation is the agent's
 * configurable commission released to the agent's wallet.
 */
async function customerConfirmCompletion(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { id } = req.params as { id: string };
  const inspection = await prisma.inspection.findUnique({ where: { id }, include: { agent: true } });
  if (!inspection) throw notFound('Inspection not found');
  if (inspection.customerId !== req.user.id) throw forbidden('Not the customer for this inspection');
  if (inspection.status !== InspectionStatus.COMPLETED) throw badRequest('Inspection not awaiting confirmation');
  if (inspection.customerConfirmedAt) throw badRequest('Already confirmed');
  if (!inspection.agent) throw badRequest('No agent assigned');
  const agent = inspection.agent;

  const pct = await getSetting('inspectionAgentCommissionPct');
  const commissionMinor = BigInt(Math.round((Number(inspection.feeMinor) * pct) / 100));

  await prisma.$transaction(async (tx) => {
    await tx.inspection.update({
      where: { id },
      data: { customerConfirmedAt: new Date() },
    });
    // Release agent commission. Idempotent by reference.
    await creditWallet(
      {
        userId: agent.userId,
        amountMinor: commissionMinor,
        reference: `INS-COMM-${inspection.id}`,
        type: WalletTxnType.COMMISSION,
        source: 'INSPECTION',
        status: WalletTxnStatus.COMPLETED,
        metadata: { inspectionId: inspection.id, pct, feeMinor: inspection.feeMinor.toString() },
      },
      tx,
    );
    // Mark agent job stats. completedInspectionCount only increments on ACTUAL completion.
    await tx.agentProfile.update({
      where: { id: agent.id },
      data: { completedJobs: { increment: 1 }, activeJobs: { decrement: 1 } },
    });
    await tx.property.update({
      where: { id: inspection.propertyId },
      data: { completedInspectionCount: { increment: 1 } },
    });
  });
  await audit('INSPECTION_CUSTOMER_CONFIRMED', { userId: req.user.id, req, resource: 'Inspection', resourceId: id, metadata: { commissionMinor: commissionMinor.toString() } });
  return { id, message: 'Inspection confirmed. Agent commission released.' };
}

async function myInspections(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const items = await prisma.inspection.findMany({
    where: { customerId: req.user.id },
    include: { property: { select: { title: true, city: true, state: true, media: true, status: true } }, agent: { include: { user: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  return { items };
}

async function agentJobs(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const agent = await prisma.agentProfile.findUnique({ where: { userId: req.user.id } });
  if (!agent) throw notFound('Agent profile not found');
  const items = await prisma.inspection.findMany({
    where: { agentId: agent.id },
    include: { property: { select: { title: true, city: true, state: true, latitude: true, longitude: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return { items };
}

async function agentAvailability(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { available } = req.body as { available?: boolean };
  const agent = await prisma.agentProfile.findUnique({ where: { userId: req.user.id } });
  if (!agent) throw notFound('Agent profile not found');
  const updated = await prisma.agentProfile.update({
    where: { id: agent.id },
    data: { availability: available ?? !agent.availability },
  });
  return { availability: updated.availability };
}

async function agentLocation(req: FastifyRequest) {
  if (!req.user) throw unauthorized();
  const { latitude, longitude, operatingCities } = req.body as {
    latitude?: number;
    longitude?: number;
    operatingCities?: string[];
  };
  const agent = await prisma.agentProfile.findUnique({ where: { userId: req.user.id } });
  if (!agent) throw notFound('Agent profile not found');
  const updated = await prisma.agentProfile.update({
    where: { id: agent.id },
    data: {
      ...(latitude != null ? { latitude } : {}),
      ...(longitude != null ? { longitude } : {}),
      ...(operatingCities ? { operatingCities: operatingCities as never } : {}),
    },
  });
  return { latitude: updated.latitude, longitude: updated.longitude, operatingCities: updated.operatingCities };
}

export function registerInspectionRoutes(app: FastifyInstance, prefix: string): void {
  app.post(`${prefix}/inspections`, { preHandler: app.authenticate, handler: bookInspection as never });
  app.get(`${prefix}/inspections`, { preHandler: app.authenticate, handler: myInspections as never });
  app.get(`${prefix}/inspections/agent/jobs`, { preHandler: app.authenticate, handler: agentJobs as never });
  app.patch(`${prefix}/inspections/agent/availability`, { preHandler: app.authenticate, handler: agentAvailability as never });
  app.put(`${prefix}/inspections/agent/location`, { preHandler: app.authenticate, handler: agentLocation as never });
  app.get(`${prefix}/inspections/:id`, { preHandler: app.authenticate, handler: getInspectionForAgent as never });
  app.post(`${prefix}/inspections/:id/accept`, { preHandler: app.authenticate, handler: agentAcceptInspection as never });
  app.post(`${prefix}/inspections/:id/start`, { preHandler: app.authenticate, handler: startInspection as never });
  app.post(`${prefix}/inspections/:id/complete`, { preHandler: app.authenticate, handler: completeInspection as never });
  app.post(`${prefix}/inspections/:id/confirm`, { preHandler: app.authenticate, handler: customerConfirmCompletion as never });
}
