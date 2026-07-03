export type RawTeam = string | { name?: string; code?: string };

export type LiveMatch = {
  id: string;
  team1: string;
  team2: string;
  score1: number;
  score2: number;
  status: 'in_progress' | 'final' | 'scheduled';
  clock: string;
  date: string;
};

export type RawMatch = {
  num?: number;
  date: string;
  time?: string;
  team1?: RawTeam;
  team2?: RawTeam;
  score?: { ft?: number[]; et?: number[]; p?: number[] } | null;
  round?: string;
  group?: string;
  venue?: string;
};

export function teamName(t: RawTeam | undefined): string {
  if (!t) return '?';
  if (typeof t === 'string') return t;
  return t.name ?? '?';
}

/**
 * Returns the decisive score for a match in priority order:
 * - p (penalties) if present
 * - et (extra time) if present
 * - ft (full time) if present
 * - null if none present
 */
export function finalScore(m: RawMatch): number[] | null {
  const s = m.score;
  if (!s) return null;
  if (s.p && s.p.length >= 2) return s.p;
  if (s.et && s.et.length >= 2) return s.et;
  if (s.ft && s.ft.length >= 2) return s.ft;
  return null;
}

/**
 * Returns whether a match has any recorded score (ft, et, or p).
 */
export function isPlayed(m: RawMatch): boolean {
  const s = m.score;
  if (!s) return false;
  return !!(s.ft && s.ft.length >= 2) ||
         !!(s.et && s.et.length >= 2) ||
         !!(s.p && s.p.length >= 2);
}

export const FLAGS: Record<string, string> = {
  'France': '🇫🇷', 'Portugal': '🇵🇹', 'Spain': '🇪🇸',
  'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Brazil': '🇧🇷', 'Argentina': '🇦🇷',
  'Germany': '🇩🇪', 'Netherlands': '🇳🇱', 'Belgium': '🇧🇪',
  'Croatia': '🇭🇷', 'Morocco': '🇲🇦', 'USA': '🇺🇸',
  'Mexico': '🇲🇽', 'Japan': '🇯🇵', 'Senegal': '🇸🇳',
  'DR Congo': '🇨🇩', 'South Africa': '🇿🇦', 'Algeria': '🇩🇿',
  'Switzerland': '🇨🇭', 'Austria': '🇦🇹', 'Sweden': '🇸🇪',
  'Norway': '🇳🇴', 'Canada': '🇨🇦', 'Australia': '🇦🇺',
  'Colombia': '🇨🇴', 'Ecuador': '🇪🇨', 'Uruguay': '🇺🇾',
  'South Korea': '🇰🇷', 'Saudi Arabia': '🇸🇦', 'Iran': '🇮🇷',
  'Ivory Coast': '🇨🇮', 'Cape Verde': '🇨🇻',
};
