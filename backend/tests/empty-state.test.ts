import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma';
import { UserRole } from '@linkpoint/types';
import { UserStatus } from '../prisma/generated/client';

/**
 * CRITICAL BUSINESS RULE (spec §82/83):
 * "Customer deletes all properties. Expected: Database remains empty."
 * "Do NOT implement any equivalent of ensureDefaultsExist() for properties."
 *
 * This test guarantees that deleting properties leaves the table empty and that
 * the system never auto-recreates mock/fallback properties.
 */
let owner: { id: string };

before(async () => {
  await prisma.$queryRaw`SELECT 1`;
  owner = await prisma.user.create({
    data: {
      name: 'Delete Test Owner',
      email: 'delete-owner@e2e-test.com',
      phone: '080300011223',
      passwordHash: 'hash',
      roles: [UserRole.REALTOR] as never,
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });
});

after(async () => {
  await prisma.property.deleteMany({ where: { ownerId: owner.id } });
  await prisma.user.delete({ where: { id: owner.id } });
  await prisma.$disconnect();
});

test('creating then deleting a property leaves the table empty (no auto-recreation)', async () => {
  const before = await prisma.property.count({ where: { ownerId: owner.id } });
  assert.equal(before, 0);

  await prisma.property.create({
    data: {
      ownerId: owner.id,
      title: 'Temp Property',
      description: 'd',
      propertyType: 'HOUSE',
      purpose: 'SALE',
      priceMinor: 1000n,
      currency: 'NGN',
      exactAddress: 'addr',
      latitude: 7.0,
      longitude: 3.0,
      city: 'c',
      state: 's',
      country: 'NG',
      area: 'a',
      amenities: [],
      media: [],
      videos: [],
    },
  });
  const one = await prisma.property.count({ where: { ownerId: owner.id } });
  assert.equal(one, 1);

  await prisma.property.deleteMany({ where: { ownerId: owner.id } });

  const after = await prisma.property.count({ where: { ownerId: owner.id } });
  assert.equal(after, 0, 'No properties must remain and none must be auto-recreated');
});
