/**
 * Tests — Agents lot 1 : anti auto-commission + payout traçable.
 *
 * Couvre les helpers purs utilisés par :
 *   - recordAgentCommission / recordAgentWinCommission (garde téléphone)
 *   - registerUser (rattachement agent_ref)
 *   - POST /api/admin/agents/:id/pay (éligibilité + montant exact)
 *
 * Run: npx tsx --test server/lib/__tests__/agent-lot1.test.ts
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { phonesMatchCanonical, tryNormalizeDrcPhone } from '../phone.js';
import { computeEligibleCommissions, validatePayoutAmount } from '../agentPayout.js';

// ============================================================
// 1. Auto-commission bloquée — comparaison de téléphones
// ============================================================
describe('phonesMatchCanonical — anti auto-commission', () => {
  const agentPhone = '0997174837'; // canonique tel que stocké après lot 1

  it('bloque quand le joueur a le même numéro que l\'agent (canonique)', () => {
    assert.equal(phonesMatchCanonical('0997174837', agentPhone), true);
  });

  it('bloque quel que soit le format saisi côté agent', () => {
    // Les anciennes fiches agent peuvent contenir des formats libres.
    assert.equal(phonesMatchCanonical('0997174837', '+243997174837'), true);
    assert.equal(phonesMatchCanonical('0997174837', '243997174837'), true);
    assert.equal(phonesMatchCanonical('0997174837', '997174837'), true);
    assert.equal(phonesMatchCanonical('0997174837', '00243997174837'), true);
    assert.equal(phonesMatchCanonical('0997174837', '0997 174 837'), true);
  });

  it('ne bloque pas des numéros différents', () => {
    assert.equal(phonesMatchCanonical('0812345678', agentPhone), false);
  });

  it('fail-open si le téléphone agent est absent ou invalide', () => {
    // Un agent sans téléphone valide ne peut pas être prouvé identique —
    // la commission n'est pas bloquée sur une impossibilité de comparaison.
    assert.equal(phonesMatchCanonical('0997174837', null), false);
    assert.equal(phonesMatchCanonical('0997174837', ''), false);
    assert.equal(phonesMatchCanonical('0997174837', 'not-a-phone'), false);
  });

  it('tryNormalizeDrcPhone produit la forme canonique 0XXXXXXXXX', () => {
    assert.equal(tryNormalizeDrcPhone('+243 997 174 837'), '0997174837');
    assert.equal(tryNormalizeDrcPhone('0997174837'), '0997174837');
  });
});

// ============================================================
// 2. Paiement — éligibilité limitée aux commissions antérieures
//    à la demande de payout
// ============================================================
describe('computeEligibleCommissions — cutoff payout_requested_at', () => {
  const requestedAt = '2026-09-24T12:00:00.000Z';
  const mk = (id: string, cdf: number, created_at: string) => ({ id, commission_cdf: cdf, created_at });

  it('exclut les commissions postérieures à la demande', () => {
    const rows = [
      mk('a', 50, '2026-09-23T10:00:00Z'),  // avant → éligible
      mk('b', 50, '2026-09-24T11:59:59Z'),  // avant → éligible
      mk('c', 50, '2026-09-24T12:00:01Z'),  // après → exclu
      mk('d', 50, '2026-09-24T15:00:00Z'),  // après → exclu
    ];
    const { ids, total } = computeEligibleCommissions(rows, requestedAt);
    assert.deepEqual(ids.sort(), ['a', 'b']);
    assert.equal(total, 100);
  });

  it('une commission à la même milliseconde est exclue (strict <)', () => {
    const rows = [mk('x', 50, requestedAt)];
    const { ids, total } = computeEligibleCommissions(rows, requestedAt);
    assert.equal(ids.length, 0);
    assert.equal(total, 0);
  });

  it('aucune demande de payout → rien n\'est éligible', () => {
    const rows = [mk('a', 50, '2026-09-20T00:00:00Z')];
    assert.deepEqual(computeEligibleCommissions(rows, null), { ids: [], total: 0 });
    assert.deepEqual(computeEligibleCommissions(rows, undefined), { ids: [], total: 0 });
  });

  it('ignore les lignes avec created_at invalide', () => {
    const rows = [mk('a', 50, 'not-a-date'), mk('b', 70, '2026-09-23T00:00:00Z')];
    const { ids, total } = computeEligibleCommissions(rows, requestedAt);
    assert.deepEqual(ids, ['b']);
    assert.equal(total, 70);
  });
});

// ============================================================
// 3. Paiement — le montant saisi doit égaler le total éligible
// ============================================================
describe('validatePayoutAmount — paiement partiel refusé', () => {
  it('refuse un montant inférieur au total éligible', () => {
    const r = validatePayoutAmount(100, 150);
    assert.equal(r.ok, false);
    assert.equal(r.expected, 150);
  });

  it('refuse un sur-paiement', () => {
    assert.equal(validatePayoutAmount(200, 150).ok, false);
  });

  it('refuse zéro, négatif et non-entier', () => {
    assert.equal(validatePayoutAmount(0, 150).ok, false);
    assert.equal(validatePayoutAmount(-50, 150).ok, false);
    assert.equal(validatePayoutAmount(150.5, 150).ok, false);
  });

  it('accepte l\'égalité exacte', () => {
    const r = validatePayoutAmount(150, 150);
    assert.equal(r.ok, true);
    assert.equal(r.expected, 150);
  });
});
