/**
 * Tests unitaires Okapi Color
 * Couverture : RNG, validation, scoring, payout, idempotency guards
 *
 * Exécuter : npx tsx --test server/routes/__tests__/okapi-color.test.ts
 * ou via vitest / jest selon la configuration du projet.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  drawUniqueNumbers,
  isValidOkapiColorNumbers,
  calculateOkapiColorHits,
  calculateOkapiColorPayout,
  OKAPI_COLOR_CONFIG,
  buildRecoveryLockKey,
  buildJackpotDecrementEventKey,
  buildJackpotResolveEventKey,
  resolveOkapiColorAdminSecret,
  resolveDrawSlotKey,
  getDrawingWindowSecs,
} from '../okapi-color.js';

// ===========================================================
// 1. RNG — drawUniqueNumbers
// ===========================================================
describe('RNG - drawUniqueNumbers', () => {

  it('tire exactement count nombres', () => {
    const nums = drawUniqueNumbers(6, 1, 24);
    assert.equal(nums.length, 6);
  });

  it('tous les rouges sont dans la plage 1-24', () => {
    for (let i = 0; i < 50; i++) {
      const nums = drawUniqueNumbers(6, 1, 24);
      assert.ok(nums.every(n => n >= 1 && n <= 24), 'number out of range');
    }
  });

  it('aucun doublon dans les rouges', () => {
    for (let i = 0; i < 50; i++) {
      const nums = drawUniqueNumbers(6, 1, 24);
      assert.equal(new Set(nums).size, 6, 'duplicates found');
    }
  });

  it('tire les ors en excluant les rouges', () => {
    for (let i = 0; i < 50; i++) {
      const rouges = drawUniqueNumbers(6, 1, 24);
      const ors    = drawUniqueNumbers(4, 1, 24, new Set(rouges));
      assert.equal(ors.length, 4);
      for (const o of ors) {
        assert.ok(!rouges.includes(o), `or ${o} found in rouges`);
      }
    }
  });

  it('aucun doublon entre rouges et ors', () => {
    for (let i = 0; i < 50; i++) {
      const rouges = drawUniqueNumbers(6, 1, 24);
      const ors    = drawUniqueNumbers(4, 1, 24, new Set(rouges));
      const all    = [...rouges, ...ors];
      assert.equal(new Set(all).size, 10, 'overlap between rouges and ors');
    }
  });

  it('résultat est trié en ordre croissant', () => {
    const nums = drawUniqueNumbers(6, 1, 24);
    for (let i = 1; i < nums.length; i++) {
      assert.ok(nums[i] > nums[i - 1], 'not sorted');
    }
  });

  it('lève une erreur si count > range disponible', () => {
    assert.throws(
      () => drawUniqueNumbers(10, 1, 5),
      /Cannot draw/,
    );
  });
});

// ===========================================================
// 2. Validation ticket — isValidOkapiColorNumbers
// ===========================================================
describe('Validation - isValidOkapiColorNumbers', () => {

  it('accepte 6 numéros uniques entre 1-24', () => {
    assert.equal(isValidOkapiColorNumbers([1, 5, 10, 15, 20, 24]), true);
  });

  it('refuse moins de 6 numéros', () => {
    assert.equal(isValidOkapiColorNumbers([1, 2, 3, 4, 5]), false);
  });

  it('refuse plus de 6 numéros', () => {
    assert.equal(isValidOkapiColorNumbers([1, 2, 3, 4, 5, 6, 7]), false);
  });

  it('refuse les doublons', () => {
    assert.equal(isValidOkapiColorNumbers([1, 1, 3, 4, 5, 6]), false);
  });

  it('refuse les numéros hors range (0)', () => {
    assert.equal(isValidOkapiColorNumbers([0, 2, 3, 4, 5, 6]), false);
  });

  it('refuse les numéros hors range (25)', () => {
    assert.equal(isValidOkapiColorNumbers([1, 2, 3, 4, 5, 25]), false);
  });

  it('refuse les non-entiers', () => {
    assert.equal(isValidOkapiColorNumbers([1, 1.5, 3, 4, 5, 6]), false);
  });

  it('refuse null / non-array', () => {
    assert.equal(isValidOkapiColorNumbers(null), false);
    assert.equal(isValidOkapiColorNumbers('1,2,3'), false);
  });
});

// ===========================================================
// 3. Scoring — calculateOkapiColorHits
// ===========================================================
describe('Scoring - calculateOkapiColorHits', () => {
  const rouges = [2, 5, 9, 14, 18, 23];
  const ors    = [1, 7, 11, 20];

  it('6 rouges trouvés', () => {
    const { redHits, goldHits } = calculateOkapiColorHits([2, 5, 9, 14, 18, 23], rouges, ors);
    assert.equal(redHits, 6);
    assert.equal(goldHits, 0);
  });

  it('3 rouges + 2 ors', () => {
    const { redHits, goldHits, totalHits } = calculateOkapiColorHits([2, 5, 9, 1, 7, 3], rouges, ors);
    assert.equal(redHits, 3);
    assert.equal(goldHits, 2);
    assert.equal(totalHits, 5);
  });

  it('0 rouges + 0 ors', () => {
    const { redHits, goldHits } = calculateOkapiColorHits([3, 4, 6, 8, 10, 12], rouges, ors);
    assert.equal(redHits, 0);
    assert.equal(goldHits, 0);
  });

  it('totalHits = redHits + goldHits', () => {
    const result = calculateOkapiColorHits([2, 5, 1, 7, 3, 4], rouges, ors);
    assert.equal(result.totalHits, result.redHits + result.goldHits);
  });
});

// ===========================================================
// 4. Payout — calculateOkapiColorPayout
// ===========================================================
describe('Payout - calculateOkapiColorPayout', () => {

  // Jackpot
  it('6 rouges — jackpot disponible => payer jackpot', () => {
    const r = calculateOkapiColorPayout(6, 0, true);
    assert.equal(r.gainsCdf, OKAPI_COLOR_CONFIG.jackpotCdf);
    assert.equal(r.jackpotPending, false);
  });

  it('6 rouges — jackpot insuffisant => jackpot_pending', () => {
    const r = calculateOkapiColorPayout(6, 0, false);
    assert.equal(r.gainsCdf, 0);
    assert.equal(r.jackpotPending, true);
  });

  // 5 rouges
  it('5 rouges + 1 or => 50 000', () => {
    assert.equal(calculateOkapiColorPayout(5, 1, true).gainsCdf, 50_000);
  });

  it('5 rouges + 3 ors => 50 000', () => {
    assert.equal(calculateOkapiColorPayout(5, 3, true).gainsCdf, 50_000);
  });

  it('5 rouges + 0 or => 25 000', () => {
    assert.equal(calculateOkapiColorPayout(5, 0, true).gainsCdf, 25_000);
  });

  // 4 rouges
  it('4 rouges + 2 ors => 15 000', () => {
    assert.equal(calculateOkapiColorPayout(4, 2, true).gainsCdf, 15_000);
  });

  it('4 rouges + 1 or => 8 000', () => {
    assert.equal(calculateOkapiColorPayout(4, 1, true).gainsCdf, 8_000);
  });

  it('4 rouges + 0 or => 8 000', () => {
    assert.equal(calculateOkapiColorPayout(4, 0, true).gainsCdf, 8_000);
  });

  // 3 rouges
  it('3 rouges + 3 ors => 5 000', () => {
    assert.equal(calculateOkapiColorPayout(3, 3, true).gainsCdf, 5_000);
  });

  it('3 rouges + 2 ors => 2 500', () => {
    assert.equal(calculateOkapiColorPayout(3, 2, true).gainsCdf, 2_500);
  });

  it('3 rouges + 1 or => 2 500', () => {
    assert.equal(calculateOkapiColorPayout(3, 1, true).gainsCdf, 2_500);
  });

  it('3 rouges + 0 or => 1 500', () => {
    assert.equal(calculateOkapiColorPayout(3, 0, true).gainsCdf, 1_500);
  });

  // 2 rouges
  it('2 rouges + 4 ors => 1 000', () => {
    assert.equal(calculateOkapiColorPayout(2, 4, true).gainsCdf, 1_000);
  });

  it('2 rouges + 3 ors => 1 000', () => {
    assert.equal(calculateOkapiColorPayout(2, 3, true).gainsCdf, 1_000);
  });

  it('2 rouges + 2 ors => 1 000', () => {
    assert.equal(calculateOkapiColorPayout(2, 2, true).gainsCdf, 1_000);
  });

  it('2 rouges + 1 or => 500', () => {
    assert.equal(calculateOkapiColorPayout(2, 1, true).gainsCdf, 500);
  });

  it('2 rouges + 0 or => 500', () => {
    assert.equal(calculateOkapiColorPayout(2, 0, true).gainsCdf, 500);
  });

  // Perdants
  it('1 rouge => 0', () => {
    assert.equal(calculateOkapiColorPayout(1, 4, true).gainsCdf, 0);
  });

  it('0 rouge => 0', () => {
    assert.equal(calculateOkapiColorPayout(0, 4, true).gainsCdf, 0);
  });

  // Pas de jackpotPending sauf cas 6R
  it('jackpotPending uniquement si 6 rouges + pot insuffisant', () => {
    assert.equal(calculateOkapiColorPayout(5, 1, false).jackpotPending, false);
    assert.equal(calculateOkapiColorPayout(4, 2, false).jackpotPending, false);
    assert.equal(calculateOkapiColorPayout(6, 0, false).jackpotPending, true);
  });
});

// ===========================================================
// 5. EV / Rentabilité (théorique)
// ===========================================================
describe('EV - payout rate', () => {
  it('taux de retour théorique entre 55 % et 70 %', () => {
    // Distribution hypergéométrique : C(24,6) = 134596
    const C246 = 134596;

    // Factorielles utiles
    const fact = (n: number): number => n <= 1 ? 1 : n * fact(n - 1);
    const C = (n: number, k: number): number => {
      if (k < 0 || k > n) return 0;
      return fact(n) / (fact(k) * fact(n - k));
    };

    let ev = 0;
    // Itérer sur toutes les combinaisons (r rouges, g ors) avec r+g <= 6
    for (let r = 0; r <= 6; r++) {
      for (let g = 0; g <= 4 && r + g <= 6; g++) {
        const ways = C(6, r) * C(4, g) * C(14, 6 - r - g);
        const prob = ways / C246;
        const { gainsCdf } = calculateOkapiColorPayout(r, g, true);
        ev += prob * gainsCdf;
      }
    }

    const payoutRate = ev / OKAPI_COLOR_CONFIG.ticketPriceCdf;
    assert.ok(payoutRate >= 0.55, `Payout rate trop bas: ${(payoutRate * 100).toFixed(2)} %`);
    assert.ok(payoutRate <= 0.70, `Payout rate trop haut: ${(payoutRate * 100).toFixed(2)} %`);
  });
});

// ===========================================================
// 6. Sécurité — user_id ne vient jamais du body
// ===========================================================
describe('Sécurité - isolation user_id', () => {
  it('OkapiColorTicketBodySchema ne contient pas user_id', async () => {
    const { OkapiColorTicketBodySchema } = await import('../../lib/validation.js');
    const parsed = OkapiColorTicketBodySchema.safeParse({
      numeros: [1, 2, 3, 4, 5, 6],
      user_id: 'attacker-uuid',
    });
    // Zod strip : user_id doit être absent du résultat
    assert.ok(!('user_id' in (parsed.data ?? {})), 'user_id leaked from body');
  });
});

// ===========================================================
// 7. Recovery — lock stable par slot (jamais Date.now())
// ===========================================================
describe('Recovery - lock key stable', () => {
  it('le lock de recovery est dérivé du slotKey', () => {
    assert.equal(buildRecoveryLockKey('2026-05-31T09:10'), 'oc:recover:2026-05-31T09:10');
  });

  it('le même slot produit toujours le même lock (déterministe)', () => {
    const a = buildRecoveryLockKey('2026-05-31T09:10');
    const b = buildRecoveryLockKey('2026-05-31T09:10');
    assert.equal(a, b);
  });

  it('le lock ne contient pas de timestamp Date.now()', () => {
    const key = buildRecoveryLockKey('2026-05-31T09:10');
    // Un timestamp epoch (>= 10 chiffres consécutifs) ne doit jamais apparaître.
    assert.ok(!/\d{10,}/.test(key), `lock key looks time-based: ${key}`);
  });

  it('des slots différents produisent des locks différents', () => {
    assert.notEqual(
      buildRecoveryLockKey('2026-05-31T09:10'),
      buildRecoveryLockKey('2026-05-31T09:20'),
    );
  });
});

// ===========================================================
// 8. Jackpot — clés d'événement idempotentes stables
// ===========================================================
describe('Jackpot - event keys idempotents', () => {
  it('clé de décrément stable par tirage + ticket', () => {
    assert.equal(
      buildJackpotDecrementEventKey('tir-1', 'tic-1'),
      'okapi-color:draw:tir-1:jackpot-decrement:tic-1',
    );
  });

  it('décrément: même (tirage,ticket) => même clé (no double décrément à la relance)', () => {
    assert.equal(
      buildJackpotDecrementEventKey('tir-1', 'tic-1'),
      buildJackpotDecrementEventKey('tir-1', 'tic-1'),
    );
  });

  it('décrément: tickets différents => clés différentes', () => {
    assert.notEqual(
      buildJackpotDecrementEventKey('tir-1', 'tic-1'),
      buildJackpotDecrementEventKey('tir-1', 'tic-2'),
    );
  });

  it('résolution jackpot_attente: clé stable par ticket', () => {
    assert.equal(buildJackpotResolveEventKey('tic-9'), 'okapi-color:jackpot-resolve:tic-9');
  });
});

// ===========================================================
// 9. Secret admin — cloisonné sur OKAPI_COLOR_ADMIN_SECRET
// ===========================================================
describe('Secret admin - cloisonnement Okapi Color', () => {
  it('utilise OKAPI_COLOR_ADMIN_SECRET', () => {
    assert.equal(resolveOkapiColorAdminSecret({ OKAPI_COLOR_ADMIN_SECRET: 'oc-secret' }), 'oc-secret');
  });

  it('retourne une chaîne vide si non configuré (jamais de fallback LOTO)', () => {
    assert.equal(resolveOkapiColorAdminSecret({}), '');
  });
});

// ===========================================================
// 10. Slot explicite — resolveDrawSlotKey
// ===========================================================
describe('Slot - resolveDrawSlotKey', () => {
  it('utilise exactement le slotKey fourni (string)', () => {
    assert.equal(resolveDrawSlotKey({ slotKey: '2026-05-31T09:10' }), '2026-05-31T09:10');
  });

  it('stringifie un slotKey numérique fourni', () => {
    assert.equal(resolveDrawSlotKey({ slotKey: 12345 }), '12345');
  });

  it('sans slotKey: retombe sur le slot précédent (format ISO sortable)', () => {
    const key = resolveDrawSlotKey({}, new Date('2026-05-31T09:15:00Z'));
    assert.match(key, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it('sans slotKey: deux appels au même instant donnent le même slot', () => {
    const now = new Date('2026-05-31T09:15:00Z');
    assert.equal(resolveDrawSlotKey({}, now), resolveDrawSlotKey({}, now));
  });
});

// ===========================================================
// 11. Timings — drawing window >= durée animation TV (~35s)
// ===========================================================
describe('Timings - drawing window', () => {
  it('la fenêtre drawing couvre l\'animation TV (>= 35s)', () => {
    assert.ok(
      getDrawingWindowSecs() >= 35,
      `drawing window trop court: ${getDrawingWindowSecs()}s (animation TV ~35s)`,
    );
  });
});
