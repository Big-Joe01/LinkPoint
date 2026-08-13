import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterMessage, containsForbiddenContactInfo } from '@linkpoint/shared';

/**
 * CRITICAL BUSINESS RULE (spec §34/82):
 * Server-side message filter must block attempts to share contact info / move deals off-platform.
 */
test('blocks Nigerian phone numbers', () => {
  const r = filterMessage('Call me on 08031234567');
  assert.equal(r.blocked, true);
  assert.ok(r.reasons.includes('PHONE_NUMBER'));
  assert.ok(!r.redacted.includes('08031234567'));
  assert.ok(r.redacted.includes('[redacted]'));
});

test('blocks international phone numbers', () => {
  const r = filterMessage('Reach me at +234 803 123 4567');
  assert.equal(r.blocked, true);
  assert.ok(r.reasons.includes('PHONE_NUMBER'));
});

test('blocks email addresses', () => {
  const r = filterMessage('Email me at john@gmail.com please');
  assert.equal(r.blocked, true);
  assert.ok(r.reasons.includes('EMAIL'));
  assert.ok(!r.redacted.includes('john@gmail.com'));
});

test('blocks WhatsApp links', () => {
  const r = filterMessage('Chat on wa.me/2348031234567');
  assert.equal(r.blocked, true);
  assert.ok(r.reasons.some((x) => x === 'WHATSAPP' || x === 'URL'));
  assert.ok(!r.redacted.includes('wa.me/2348031234567'));
});

test('blocks Instagram handles', () => {
  const r = filterMessage('Follow me at instagram.com/john_doe');
  assert.equal(r.blocked, true);
  assert.ok(r.reasons.includes('INSTAGRAM'));
});

test('blocks Telegram links', () => {
  const r = filterMessage('t.me/johndoe for details');
  assert.equal(r.blocked, true);
  assert.ok(r.reasons.includes('TELEGRAM'));
});

test('blocks raw bank account numbers', () => {
  const r = filterMessage('Transfer to 0123456789');
  assert.equal(r.blocked, true);
  // A 10-digit account number is caught either as a bank account or phone number;
  // either way the content must be redacted and the message blocked.
  assert.ok(!r.redacted.includes('0123456789'));
  assert.ok(r.reasons.length > 0);
});

test('blocks external URLs', () => {
  const r = filterMessage('See https://example.com/listing');
  assert.equal(r.blocked, true);
  assert.ok(r.reasons.includes('URL'));
});

test('does not block normal messages', () => {
  const r = filterMessage('Hi, is this property still available?');
  assert.equal(r.blocked, false);
  assert.deepEqual(r.reasons, []);
  assert.equal(r.redacted, 'Hi, is this property still available?');
});

test('containsForbiddenContactInfo detects without mutating', () => {
  assert.equal(containsForbiddenContactInfo('08031234567'), true);
  assert.equal(containsForbiddenContactInfo('When can I inspect?'), false);
});
