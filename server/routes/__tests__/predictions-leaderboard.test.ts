/**
 * Unit tests for leaderboard tie-breaking determinism fix.
 *
 * Verifies that when two users have the same total points, the older
 * account (earlier created_at) ranks higher, and that the result is
 * stable regardless of the order rows are inserted into the Map
 * (simulating different DB return orders).
 *
 * Run with: npx tsx --test server/routes/__tests__/predictions-leaderboard.test.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { rankLeaderboard } from '../predictions.js';

describe('rankLeaderboard — tie-break determinism', () => {

  it('ranks by total points descending when no ties', () => {
    const totals = new Map<string, number>([
      ['user-a', 500],
      ['user-b', 1000],
      ['user-c', 250],
    ]);
    const createdAt = new Map<string, string>([
      ['user-a', '2026-01-15T00:00:00Z'],
      ['user-b', '2026-02-01T00:00:00Z'],
      ['user-c', '2026-03-10T00:00:00Z'],
    ]);

    const result = rankLeaderboard(totals, createdAt, 10);

    assert.equal(result[0][0], 'user-b'); // 1000
    assert.equal(result[1][0], 'user-a'); // 500
    assert.equal(result[2][0], 'user-c'); // 250
  });

  it('tie-breaks by account age: older account wins on equal points', () => {
    const totals = new Map<string, number>([
      ['user-new', 500],
      ['user-old', 500],
    ]);
    const createdAt = new Map<string, string>([
      ['user-new', '2026-06-01T00:00:00Z'],
      ['user-old', '2026-01-01T00:00:00Z'],
    ]);

    const result = rankLeaderboard(totals, createdAt, 10);

    assert.equal(result[0][0], 'user-old');  // older account, same points
    assert.equal(result[1][0], 'user-new');
  });

  it('remains stable when Map insertion order differs (user-old first vs user-new first)', () => {
    const createdAt = new Map<string, string>([
      ['user-new', '2026-06-01T00:00:00Z'],
      ['user-old', '2026-01-01T00:00:00Z'],
    ]);

    // Order 1: user-old inserted first
    const totals1 = new Map<string, number>([
      ['user-old', 500],
      ['user-new', 500],
    ]);
    const result1 = rankLeaderboard(totals1, createdAt, 10);

    // Order 2: user-new inserted first
    const totals2 = new Map<string, number>([
      ['user-new', 500],
      ['user-old', 500],
    ]);
    const result2 = rankLeaderboard(totals2, createdAt, 10);

    // Both orders must produce identical results
    assert.deepEqual(result1, result2);
    assert.equal(result1[0][0], 'user-old'); // older wins in both cases
  });

  it('stability with 3+ tied users and shuffled insertion orders', () => {
    const createdAt = new Map<string, string>([
      ['user-a', '2026-03-01T00:00:00Z'],
      ['user-b', '2026-01-01T00:00:00Z'], // oldest
      ['user-c', '2026-02-01T00:00:00Z'],
    ]);

    // All three have the same points
    const orders = [
      [['user-a', 300], ['user-b', 300], ['user-c', 300]],
      [['user-c', 300], ['user-a', 300], ['user-b', 300]],
      [['user-b', 300], ['user-c', 300], ['user-a', 300]],
    ] as [string, number][][];

    const expected = ['user-b', 'user-c', 'user-a']; // by age: Jan, Feb, Mar

    for (const order of orders) {
      const totals = new Map<string, number>(order);
      const result = rankLeaderboard(totals, createdAt, 10);
      const ids = result.map(([id]) => id);
      assert.deepEqual(ids, expected, `Failed for insertion order: ${order.map(([id]) => id).join(', ')}`);
    }
  });

  it('respects the limit parameter', () => {
    const totals = new Map<string, number>([
      ['u1', 100], ['u2', 200], ['u3', 300], ['u4', 400], ['u5', 500],
    ]);
    const createdAt = new Map<string, string>(
      [...totals.keys()].map((id) => [id, '2026-01-01T00:00:00Z']),
    );

    const result = rankLeaderboard(totals, createdAt, 3);
    assert.equal(result.length, 3);
    assert.equal(result[0][0], 'u5'); // 500
    assert.equal(result[1][0], 'u4'); // 400
    assert.equal(result[2][0], 'u3'); // 300
  });

  it('does not change behavior when there are no ties', () => {
    const totals = new Map<string, number>([
      ['user-a', 1000],
      ['user-b', 500],
      ['user-c', 100],
    ]);
    const createdAt = new Map<string, string>([
      ['user-a', '2026-06-01T00:00:00Z'], // newest but highest score
      ['user-b', '2026-01-01T00:00:00Z'], // oldest but middle score
      ['user-c', '2026-03-01T00:00:00Z'],
    ]);

    const result = rankLeaderboard(totals, createdAt, 10);

    // Points take priority over age — no tie-break applied
    assert.equal(result[0][0], 'user-a'); // 1000
    assert.equal(result[1][0], 'user-b'); // 500
    assert.equal(result[2][0], 'user-c'); // 100
  });

  it('handles missing created_at gracefully (treats as empty string)', () => {
    const totals = new Map<string, number>([
      ['user-known', 500],
      ['user-unknown', 500],
    ]);
    const createdAt = new Map<string, string>([
      ['user-known', '2026-01-01T00:00:00Z'],
      // user-unknown deliberately absent
    ]);

    const result = rankLeaderboard(totals, createdAt, 10);

    // Empty string sorts before any ISO date, so unknown user ranks first
    // (treated as "oldest"). This is a safe fallback — doesn't crash.
    assert.equal(result[0][0], 'user-unknown');
    assert.equal(result[1][0], 'user-known');
  });
});
