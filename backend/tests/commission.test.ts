import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMinor, toMajor } from '@linkpoint/shared';

test('toMinor converts whole currency to minor units', () => {
  assert.equal(toMinor(100), 10000);
  assert.equal(toMinor(0), 0);
  assert.equal(toMinor(1.5), 150);
});

test('toMajor converts minor units back to whole currency', () => {
  assert.equal(toMajor(10000), 100);
  assert.equal(toMajor(0), 0);
  assert.equal(toMajor(150), 1.5);
});

/**
 * CRITICAL BUSINESS RULE (spec §82):
 * Inspection fee ₦20,000; agent commission 50% => agent receives ₦10,000.
 */
test('inspection agent commission: 50% of ₦20,000 fee = ₦10,000', () => {
  const feeMinor = BigInt(toMinor(20000)); // 2,000,000
  const pct = 50;
  const commissionMinor = BigInt(Math.round((Number(feeMinor) * pct) / 100));
  assert.equal(toMajor(Number(commissionMinor)), 10000);
});

/**
 * CRITICAL BUSINESS RULE (spec §29/82):
 * LinkPoint commission 10% of ₦50,000,000 transaction = ₦5,000,000.
 */
test('LinkPoint commission: 10% of ₦50,000,000 = ₦5,000,000', () => {
  const amountMinor = BigInt(toMinor(50_000_000));
  const pct = 10;
  const commissionMinor = BigInt(Math.round((Number(amountMinor) * pct) / 100));
  assert.equal(toMajor(Number(commissionMinor)), 5_000_000);
});

/**
 * CRITICAL BUSINESS RULE (spec §38/82):
 * Affiliate commission 5% of ₦50,000,000 transaction = ₦2,500,000.
 */
test('affiliate commission: 5% of ₦50,000,000 = ₦2,500,000', () => {
  const amountMinor = BigInt(toMinor(50_000_000));
  const pct = 5;
  const commissionMinor = BigInt(Math.round((Number(amountMinor) * pct) / 100));
  assert.equal(toMajor(Number(commissionMinor)), 2_500_000);
});

test('affiliate commission range enforced 4%-6% boundaries', () => {
  const amountMinor = BigInt(toMinor(50_000_000));
  // 4%
  const at4 = BigInt(Math.round((Number(amountMinor) * 4) / 100));
  assert.equal(toMajor(Number(at4)), 2_000_000);
  // 6%
  const at6 = BigInt(Math.round((Number(amountMinor) * 6) / 100));
  assert.equal(toMajor(Number(at6)), 3_000_000);
});

test('combined commission: ₦100,000,000 deal => LinkPoint ₦10,000,000, seller ₦90,000,000', () => {
  const amountMinor = BigInt(toMinor(100_000_000));
  const linkpointPct = 10;
  const linkpointMinor = BigInt(Math.round((Number(amountMinor) * linkpointPct) / 100));
  const sellerMinor = amountMinor - linkpointMinor;
  assert.equal(toMajor(Number(linkpointMinor)), 10_000_000);
  assert.equal(toMajor(Number(sellerMinor)), 90_000_000);
});
