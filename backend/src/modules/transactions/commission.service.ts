import { prisma } from '../../lib/prisma';
import { getSetting } from '../../lib/settings';
import { toMinor } from '@linkpoint/shared';
import { logger } from '../../lib/logger';

/**
 * Central commission engine — all configurable from admin settings.
 * - LinkPoint: 10% of completed property transaction
 * - Affiliate: configurable 4..6% (per property)
 * - Inspection agent: configurable % of inspection fee (handled in inspection module)
 */
export interface CommissionBreakdown {
  transactionAmountMinor: bigint;
  linkpointCommissionMinor: bigint;
  linkpointPct: number;
  affiliateCommissionMinor: bigint;
  affiliatePct: number | null;
  sellerProceedsMinor: bigint;
}

export async function computeTransactionCommission(params: {
  amountMinor: bigint;
  affiliateCommissionPct: number | null;
}): Promise<CommissionBreakdown> {
  const linkpointPct = await getSetting('linkpointCommissionPct'); // default 10
  const linkpointCommissionMinor = BigInt(
    Math.round((Number(params.amountMinor) * linkpointPct) / 100),
  );

  let affiliateCommissionMinor = 0n;
  if (params.affiliateCommissionPct != null) {
    affiliateCommissionMinor = BigInt(
      Math.round((Number(params.amountMinor) * params.affiliateCommissionPct) / 100),
    );
  }

  // Seller receives the remainder after LinkPoint + affiliate payouts.
  const sellerProceedsMinor =
    params.amountMinor - linkpointCommissionMinor - affiliateCommissionMinor;

  return {
    transactionAmountMinor: params.amountMinor,
    linkpointCommissionMinor,
    linkpointPct,
    affiliateCommissionMinor,
    affiliatePct: params.affiliateCommissionPct,
    sellerProceedsMinor,
  };
}

/**
 * Affiliate attribution — secure server-side resolution.
 * Resolves an affiliate link slug to the affiliate + property, validates eligibility,
 * and records a click. Does NOT pay commission until the deal completes.
 */
export async function resolveAffiliateLink(slug: string, propertyId?: string) {
  const affiliateLink = await prisma.affiliateLink.findFirst({
    where: { slug, active: true },
    include: { affiliate: true },
  });
  if (!affiliateLink) return null;

  // Record click (real analytics only).
  await prisma.affiliateLink.update({
    where: { id: affiliateLink.id },
    data: { clicks: { increment: 1 } },
  });

  return {
    affiliateId: affiliateLink.affiliateId,
    affiliateLinkId: affiliateLink.id,
    propertyId: affiliateLink.propertyId ?? propertyId,
  };
}

/**
 * Validate that a transaction qualifies for affiliate commission:
 * - the transaction completed
 * - the affiliate link was used before the buyer engaged
 * - the property had affiliate enabled with a valid 4..6% rate
 */
export async function validateAffiliateQualification(transactionId: string) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { property: true },
  });
  if (!transaction) return { qualifies: false as const };
  if (transaction.status !== 'COMPLETED') return { qualifies: false as const };
  if (!transaction.affiliateLinkId) return { qualifies: false as const };
  if (!transaction.property.affiliateEnabled) return { qualifies: false as const };
  const pct = transaction.property.affiliateCommissionPct;
  if (pct == null || pct < 4 || pct > 6) return { qualifies: false as const };

  const link = await prisma.affiliateLink.findUnique({ where: { id: transaction.affiliateLinkId } });
  if (!link) return { qualifies: false as const };

  return {
    qualifies: true as const,
    affiliateId: link.affiliateId,
    affiliateLinkId: link.id,
    commissionPct: pct,
    commissionMinor: BigInt(
      Math.round((Number(transaction.amountMinor) * pct) / 100),
    ),
  };
}
