/**
 * Test: Unipesa signature key sorting (deterministic regardless of key order)
 *
 * Run: npx tsx --test server/lib/__tests__/unipesa-signature-sort.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSignature } from '../unipesa.js';

describe('Unipesa signature key sorting', () => {
  test('signature is identical regardless of key insertion order', () => {
    const secret = 'test-secret-key';
    const data1 = { merchant_id: 'M1', order_id: 'O1', amount: 100, currency: 'CDF' };
    const data2 = { currency: 'CDF', amount: 100, order_id: 'O1', merchant_id: 'M1' };
    const sig1 = calculateSignature(data1, secret);
    const sig2 = calculateSignature(data2, secret);
    assert.equal(sig1, sig2, 'signatures must match regardless of key order');
  });

  test('signature excludes the signature key itself', () => {
    const secret = 'test-secret-key';
    const data = { merchant_id: 'M1', amount: 100, signature: 'should-be-ignored' };
    const sig = calculateSignature(data, secret);
    const dataWithoutSig = { merchant_id: 'M1', amount: 100 };
    const sigWithout = calculateSignature(dataWithoutSig, secret);
    assert.equal(sig, sigWithout, 'signature field must be excluded from signing');
  });

  test('nested object keys are also sorted', () => {
    const secret = 'test-secret-key';
    const data1 = { outer: { b: 2, a: 1 }, merchant_id: 'M1' };
    const data2 = { merchant_id: 'M1', outer: { a: 1, b: 2 } };
    const sig1 = calculateSignature(data1, secret);
    const sig2 = calculateSignature(data2, secret);
    assert.equal(sig1, sig2, 'nested object keys must be sorted');
  });
});
