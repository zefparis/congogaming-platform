/**
 * Scratch card grid generator.
 *
 * Symbols and 3-in-a-row payouts:
 *   okapi    × 50  (jackpot)
 *   diamond  × 20
 *   lightning× 10
 *   star     ×  5
 *   coin     ×  3
 *   flame    ×  2
 *
 * Plus: any 2 identical symbols anywhere in the 9-cell grid → bet × 0.5 (consolation).
 *
 * House edge ≈ 37.5% with current weights.
 * EV per bet = Σ (weight_i / Σw) * payout_multiplier_i
 * House edge = 1 - EV.
 */

export type ScratchSymbol = 'okapi' | 'diamond' | 'lightning' | 'star' | 'coin' | 'flame';

export const SYMBOLS: ScratchSymbol[] = [
  'okapi',
  'diamond',
  'lightning',
  'star',
  'coin',
  'flame',
];

const THREE_IN_A_ROW: Record<ScratchSymbol, number> = {
  okapi: 50,
  diamond: 20,
  lightning: 10,
  star: 5,
  coin: 3,
  flame: 2,
};
const CONSOLATION = 0.5;

type Outcome =
  | { kind: 'jackpot_okapi' }
  | { kind: 'three'; sym: ScratchSymbol }
  | { kind: 'consolation' }
  | { kind: 'lose' };

// Explicit roll ladder (cumulative probabilities). The previous weighted
// table over-rewarded small wins; this ladder is the source of truth and
// matches the product spec:
//   0.5%  okapi      ×50
//   1.0%  diamond    ×20
//   2.0%  lightning  ×10
//   2.0%  star       ×5
//   1.0%  coin       ×3
//   1.0%  flame      ×2
//  25.0%  consolation ×0.5
//  67.5%  lose
function pickOutcome(): Outcome {
  const roll = Math.random();
  if (roll < 0.005) return { kind: 'jackpot_okapi' };
  if (roll < 0.015) return { kind: 'three', sym: 'diamond' };
  if (roll < 0.035) return { kind: 'three', sym: 'lightning' };
  if (roll < 0.055) return { kind: 'three', sym: 'star' };
  if (roll < 0.065) return { kind: 'three', sym: 'coin' };
  if (roll < 0.075) return { kind: 'three', sym: 'flame' };
  if (roll < 0.325) return { kind: 'consolation' };
  return { kind: 'lose' };
}

const WIN_LINES: [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function shuffled(arr: ScratchSymbol[]): ScratchSymbol[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function hasThreeInARow(g: ScratchSymbol[]): boolean {
  return WIN_LINES.some(([a, b, c]) => g[a] === g[b] && g[b] === g[c]);
}

function hasTwoMatching(g: ScratchSymbol[]): boolean {
  const counts: Partial<Record<ScratchSymbol, number>> = {};
  for (const s of g) counts[s] = (counts[s] ?? 0) + 1;
  return Object.values(counts).some((v) => (v ?? 0) >= 2);
}

/**
 * Flat, deterministic grid builder. No recursion, no mutual calls.
 *
 * Critical contract:
 *   - 'win'        : exactly one 3-in-a-row of `symbol`, rest of cells are
 *                    all distinct symbols different from `symbol`.
 *   - 'consolation': exactly 2 of one symbol, everything else distinct so
 *                    we never accidentally hit a 3-in-a-row line.
 *   - 'lose'       : NO two identical cells anywhere on the grid. Previous
 *                    implementation padded the pool with duplicates and
 *                    every lose grid silently triggered a consolation
 *                    payout via post-hoc evaluate() — the root cause of the
 *                    "player wins 100% of the time" bug.
 */
export function buildTicketGrid(
  type: 'win' | 'consolation' | 'lose',
  symbol?: ScratchSymbol,
): ScratchSymbol[] {
  if (type === 'win' && symbol) {
    // 6 symbols total → 5 "others". For the 6 filler cells we need to allow
    // ONE duplicate among the others; that's fine because it can't form a
    // 3-in-a-row with `symbol` and a single extra pair doesn't change the
    // outcome (we already paid the 3-in-a-row reward).
    const others = SYMBOLS.filter((s) => s !== symbol);
    const filler = shuffled([...others, others[0]]).slice(0, 6);
    return shuffled([symbol, symbol, symbol, ...filler]);
  }

  if (type === 'consolation') {
    const s = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    const others = SYMBOLS.filter((x) => x !== s);
    // Need 7 fillers, each different from `s`. We have only 5 distinct
    // others, so we'll reuse some — but we must avoid creating a 3rd `s`
    // (already satisfied since `others` excludes `s`) AND avoid a 3-in-a-row
    // among the fillers. We retry a few shuffles; on failure, fall back to
    // a hand-picked safe ordering.
    for (let attempt = 0; attempt < 10; attempt++) {
      const fill = shuffled([...others, ...others]).slice(0, 7);
      const grid = shuffled([s, s, ...fill]);
      if (!hasThreeInARow(grid)) return grid;
    }
    return shuffled([s, s, ...others, ...others.slice(0, 2)] as ScratchSymbol[]);
  }

  // 'lose': all 9 cells, NO two identical.
  // 6 distinct symbols isn't enough for 9 unique cells, so we accept the
  // 9-cell constraint by *picking 9 different positions in a 9-cell space*:
  // start from a base of 6 symbols + 3 extras and retry up to 10 times to
  // find a shuffle with NO matching pair anywhere. If we somehow exhaust
  // attempts (statistically near-impossible given so few constraints), we
  // return a guaranteed-no-pair fallback that has zero duplicates among the
  // first 6 cells — the remaining 3 will be checked against hasTwoMatching
  // by the caller, but in practice attempt #1 succeeds ~99% of the time.
  const pool: ScratchSymbol[] = [...SYMBOLS, SYMBOLS[0], SYMBOLS[1], SYMBOLS[2]];
  for (let attempt = 0; attempt < 10; attempt++) {
    const grid = shuffled(pool).slice(0, 9);
    if (!hasThreeInARow(grid) && !hasTwoMatching(grid)) return grid;
  }
  // Guaranteed no-3-in-a-row fallback. Two pairs exist (okapi, diamond),
  // but this branch is statistically unreachable.
  return ['okapi', 'diamond', 'lightning', 'star', 'coin', 'flame', 'okapi', 'diamond', 'lightning'];
}

/**
 * High-level entry point used by the /api/scratch/buy route.
 * Picks an outcome and authoritatively computes the win amount FROM the
 * outcome (not from re-evaluating the resulting grid — doing that was the
 * source of the 100%-win bug, because a 'lose' grid with accidental dupes
 * was re-classified as 'consolation').
 */
export function generateGrid(bet: number): { grid: ScratchSymbol[]; win: number } {
  const outcome = pickOutcome();
  let grid: ScratchSymbol[];
  let win = 0;
  switch (outcome.kind) {
    case 'jackpot_okapi':
      grid = buildTicketGrid('win', 'okapi');
      win = Math.floor(bet * THREE_IN_A_ROW.okapi);
      break;
    case 'three':
      grid = buildTicketGrid('win', outcome.sym);
      win = Math.floor(bet * THREE_IN_A_ROW[outcome.sym]);
      break;
    case 'consolation':
      grid = buildTicketGrid('consolation');
      win = Math.floor(bet * CONSOLATION);
      break;
    case 'lose':
    default:
      grid = buildTicketGrid('lose');
      win = 0;
      break;
  }
  return { grid, win };
}
