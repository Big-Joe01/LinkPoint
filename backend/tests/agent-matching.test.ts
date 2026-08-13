import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm, distanceZone } from '@linkpoint/shared';

/**
 * CRITICAL BUSINESS RULE (spec §17/18/82):
 * Inspection agents must be matched by proximity to the PROPERTY, not the customer.
 *
 * Scenario: Property = Abeokuta, Customer = Lagos
 *   Agent A = Lagos, Agent B = Abeoguta
 *   Agent B (closer to property) must rank higher.
 */
test('agent near the property has a smaller distance than an agent near the customer', () => {
  // Property in Abeokuta
  const property = { latitude: 7.1475, longitude: 3.3619 };
  // Customer in Lagos (irrelevant to matching)
  const customer = { latitude: 6.5244, longitude: 3.3792 };
  // Agent A near the customer (Lagos)
  const agentA = { latitude: 6.5244, longitude: 3.3792 };
  // Agent B near the property (Abeokuta)
  const agentB = { latitude: 7.1475, longitude: 3.3619 };

  const distA = haversineKm(property, agentA);
  const distB = haversineKm(property, agentB);

  assert.ok(distB < distA, 'Agent near property must be closer than agent near customer');
  assert.ok(distB < 5, 'Agent B should be within ~5km of the property');
  assert.ok(distA > 50, 'Agent A (Lagos) should be far from Abeokuta property');
  // Customer location is never the reference point.
  const distCustomerToProperty = haversineKm(customer, property);
  assert.notEqual(distCustomerToProperty, distB);
});

test('distanceZone classifies local/regional/remote correctly', () => {
  assert.equal(distanceZone(0), 'LOCAL');
  assert.equal(distanceZone(15), 'LOCAL');
  assert.equal(distanceZone(16), 'REGIONAL');
  assert.equal(distanceZone(80), 'REGIONAL');
  assert.equal(distanceZone(81), 'REMOTE');
});

test('haversineKm returns 0 for identical points', () => {
  const p = { latitude: 6.45, longitude: 3.4 };
  assert.equal(haversineKm(p, p), 0);
});
