import { prisma } from '../../lib/prisma';
import { getSetting } from '../../lib/settings';
import { haversineKm, distanceZone, toMinor } from '@linkpoint/shared';
import { AgentProfile, InspectionStatus, VerificationStatus } from '../../../prisma/generated/client';
import { badRequest } from '../../lib/errors';

/**
 * Inspection pricing engine — configurable, not hardcoded.
 * Final fee = base + zone surcharge + property-type fee (configurable in admin).
 */
export async function calculateInspectionFee(input: {
  propertyLatitude: number;
  propertyLongitude: number;
  agentLatitude?: number;
  agentLongitude?: number;
  propertyType: string;
}): Promise<{ feeMinor: bigint; breakdown: Record<string, number | string> }> {
  const base = await getSetting('inspectionBaseFeeMinor');
  let zoneSurcharge = 0;
  const breakdown: Record<string, number | string> = { base };

  if (input.agentLatitude != null && input.agentLongitude != null) {
    const km = haversineKm(
      { latitude: input.propertyLatitude, longitude: input.propertyLongitude },
      { latitude: input.agentLatitude, longitude: input.agentLongitude },
    );
    const zone = distanceZone(km);
    if (zone === 'LOCAL') {
      zoneSurcharge = await getSetting('inspectionLocalSurchargeMinor');
    } else if (zone === 'REGIONAL') {
      zoneSurcharge = await getSetting('inspectionRegionalSurchargeMinor');
    } else {
      zoneSurcharge = await getSetting('inspectionRemoteSurchargeMinor');
    }
    breakdown.zone = zone;
    breakdown.zoneSurcharge = zoneSurcharge;
    breakdown.distanceKm = Math.round(km * 100) / 100;
  }
  // Property-type fee could be configurable; using base default for now.
  breakdown.total = base + zoneSurcharge;
  return { feeMinor: BigInt(base + zoneSurcharge), breakdown };
}

export interface RankedAgent {
  agent: AgentProfile & { user: { name: string; phone: string; email: string } };
  distanceKm: number;
  score: number;
}

/**
 * Agent matching engine — ranks available, verified agents by proximity to the PROPERTY.
 * The reference point is the property's coordinates, NOT the customer's location.
 */
export async function rankAgentsByProximityToProperty(property: {
  latitude: number;
  longitude: number;
}): Promise<RankedAgent[]> {
  const candidates = await prisma.agentProfile.findMany({
    where: {
      availability: true,
      verification: VerificationStatus.VERIFIED,
      latitude: { not: null },
      longitude: { not: null },
      user: { status: 'ACTIVE' },
    },
    include: { user: { select: { name: true, phone: true, email: true } } },
  });

  const propertyPoint = { latitude: property.latitude, longitude: property.longitude };
  const ranked = candidates
    .map((agent) => {
      const distanceKm =
        agent.latitude != null && agent.longitude != null
          ? haversineKm(propertyPoint, { latitude: agent.latitude!, longitude: agent.longitude! })
          : Number.POSITIVE_INFINITY;
      // Score: lower distance = higher priority. Penalize high active workload & low acceptance.
      const workloadPenalty = agent.activeJobs * 5;
      const acceptanceBonus = agent.acceptanceRate * 10;
      const ratingBonus = agent.rating * 2;
      const score = distanceKm + workloadPenalty - acceptanceBonus - ratingBonus;
      return { agent, distanceKm, score };
    })
    .filter((r) => Number.isFinite(r.distanceKm))
    .sort((a, b) => a.score - b.score);

  return ranked;
}

/** Compute the agent's commission from the inspection fee using the configurable %. */
export async function computeAgentCommission(feeMinor: bigint): Promise<{ commissionMinor: bigint; pct: number }> {
  const pct = await getSetting('inspectionAgentCommissionPct');
  const commissionMinor = BigInt(Math.round((Number(feeMinor) * pct) / 100));
  return { commissionMinor, pct };
}
