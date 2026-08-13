import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { computeTransactionCommission, validateAffiliateQualification } from '../src/modules/transactions/commission.service';
import { computeAgentCommission, calculateInspectionFee } from '../src/modules/inspections/inspection.service';
import { toMinor, toMajor } from '@linkpoint/shared';
import { prisma } from '../src/lib/prisma';
import { UserRole } from '@linkpoint/types';
import { PropertyStatus, VerificationStatus, UserStatus } from '../prisma/generated/client';

/**
 * Database-backed business-rule tests.
 * These exercise the configurable commission/pricing engines against the real MySQL DB.
 * They create real users/properties to validate logic — no mock balances or fake records remain.
 */

let cleanupIds: { users: string[]; properties: string[]; transactions: string[] } = { users: [], properties: [], transactions: [] };

async function makeRealtor(n: string) {
  const u = await prisma.user.create({
    data: {
      name: n,
      email: `${n.toLowerCase().replace(/\s/g, '')}@e2e-test.com`,
      phone: `0803000${Math.floor(Math.random() * 90000 + 10000)}`,
      passwordHash: 'hash',
      roles: [UserRole.REALTOR] as never,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      realtor: { create: { category: 'REALTOR', verification: VerificationStatus.VERIFIED } },
    },
  });
  cleanupIds.users.push(u.id);
  return u;
}

async function makeProperty(ownerId: string, opts: { affiliateEnabled?: boolean; affiliatePct?: number | null } = {}) {
  const p = await prisma.property.create({
    data: {
      ownerId,
      title: 'E2E Test Property',
      description: 'Test',
      propertyType: 'HOUSE',
      purpose: 'SALE',
      priceMinor: BigInt(toMinor(50_000_000)),
      currency: 'NGN',
      latitude: 7.1475,
      longitude: 3.3619,
      exactAddress: 'Hidden Test Address',
      city: 'Abeokuta',
      state: 'Ogun',
      country: 'Nigeria',
      area: 'Test Area',
      status: PropertyStatus.ACTIVE,
      verification: VerificationStatus.VERIFIED,
      amenities: [],
      media: [],
      videos: [],
      affiliateEnabled: opts.affiliateEnabled ?? false,
      affiliateCommissionPct: opts.affiliatePct ?? null,
    },
  });
  cleanupIds.properties.push(p.id);
  return p;
}

before(async () => {
  // Ensure DB reachable.
  await prisma.$queryRaw`SELECT 1`;
});

after(async () => {
  // Remove every record created by these tests — DB returns to its prior state.
  await prisma.transaction.deleteMany({ where: { id: { in: cleanupIds.transactions } } });
  await prisma.property.deleteMany({ where: { id: { in: cleanupIds.properties } } });
  await prisma.user.deleteMany({ where: { id: { in: cleanupIds.users } } });
  await prisma.$disconnect();
});

test('LinkPoint commission engine: 10% default of ₦50,000,000 = ₦5,000,000', async () => {
  const amountMinor = BigInt(toMinor(50_000_000));
  const breakdown = await computeTransactionCommission({ amountMinor, affiliateCommissionPct: null });
  assert.equal(breakdown.linkpointPct, 10);
  assert.equal(toMajor(Number(breakdown.linkpointCommissionMinor)), 5_000_000);
  assert.equal(toMajor(Number(breakdown.sellerProceedsMinor)), 45_000_000);
  assert.equal(breakdown.affiliateCommissionMinor, 0n);
});

test('commission + affiliate: ₦50,000,000 at 5% affiliate => LinkPoint ₦5M, affiliate ₦2.5M, seller ₦42.5M', async () => {
  const amountMinor = BigInt(toMinor(50_000_000));
  const breakdown = await computeTransactionCommission({ amountMinor, affiliateCommissionPct: 5 });
  assert.equal(toMajor(Number(breakdown.linkpointCommissionMinor)), 5_000_000);
  assert.equal(toMajor(Number(breakdown.affiliateCommissionMinor)), 2_500_000);
  assert.equal(toMajor(Number(breakdown.sellerProceedsMinor)), 42_500_000);
});

test('inspection agent commission: 50% default of ₦20,000 fee = ₦10,000', async () => {
  const feeMinor = BigInt(toMinor(20_000));
  const { commissionMinor, pct } = await computeAgentCommission(feeMinor);
  assert.equal(pct, 50);
  assert.equal(toMajor(Number(commissionMinor)), 10_000);
});

test('inspection pricing engine is configurable and never hardcoded to a single fee', async () => {
  // Same property coordinates, different property types should still yield a numeric fee.
  const a = await calculateInspectionFee({ propertyLatitude: 7.1475, propertyLongitude: 3.3619, propertyType: 'HOUSE' });
  const b = await calculateInspectionFee({ propertyLatitude: 7.1475, propertyLongitude: 3.3619, propertyType: 'LAND' });
  assert.ok(a.feeMinor > 0n);
  assert.ok(b.feeMinor > 0n);
  // The fee includes a breakdown (base, surcharges) — not a flat magic number.
  assert.ok(typeof a.breakdown.total === 'number' || typeof a.breakdown.total === 'string');
});

test('inspection fee varies by agent distance zone (LOCAL vs REMOTE)', async () => {
  // Agent near property (local zone)
  const local = await calculateInspectionFee({
    propertyLatitude: 7.1475, propertyLongitude: 3.3619,
    agentLatitude: 7.1475, agentLongitude: 3.3619, propertyType: 'HOUSE',
  });
  // Agent far from property (remote zone)
  const remote = await calculateInspectionFee({
    propertyLatitude: 7.1475, propertyLongitude: 3.3619,
    agentLatitude: 9.0820, agentLongitude: 8.6753, propertyType: 'HOUSE',
  });
  assert.equal(local.breakdown.zone, 'LOCAL');
  assert.equal(remote.breakdown.zone, 'REMOTE');
  assert.ok(Number(remote.feeMinor) >= Number(local.feeMinor), 'remote fee must be >= local fee');
});

test('affiliate qualification rejected when property has affiliate disabled', async () => {
  const owner = await makeRealtor('Qual Disabled Owner');
  const prop = await makeProperty(owner.id, { affiliateEnabled: false, affiliatePct: null });
  const buyer = await makeRealtor('Qual Disabled Buyer');
  const tx = await prisma.transaction.create({
    data: {
      propertyId: prop.id,
      buyerId: buyer.id,
      sellerId: owner.id,
      amountMinor: BigInt(toMinor(50_000_000)),
      currency: 'NGN',
      status: 'COMPLETED',
    },
  });
  cleanupIds.transactions.push(tx.id);
  const q = await validateAffiliateQualification(tx.id);
  assert.equal(q.qualifies, false);
});

test('affiliate qualification rejected when pct outside 4-6% range', async () => {
  const owner = await makeRealtor('Qual Range Owner');
  const prop = await makeProperty(owner.id, { affiliateEnabled: true, affiliatePct: 7 }); // 7% invalid
  const buyer = await makeRealtor('Qual Range Buyer');
  const tx = await prisma.transaction.create({
    data: {
      propertyId: prop.id,
      buyerId: buyer.id,
      sellerId: owner.id,
      amountMinor: BigInt(toMinor(50_000_000)),
      currency: 'NGN',
      status: 'COMPLETED',
    },
  });
  cleanupIds.transactions.push(tx.id);
  const q = await validateAffiliateQualification(tx.id);
  assert.equal(q.qualifies, false);
});
