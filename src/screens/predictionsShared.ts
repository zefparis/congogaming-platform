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
  scorers1?: string[];
  scorers2?: string[];
  stage?: string;
  homePenaltyScore?: number;
  awayPenaltyScore?: number;
};

export type RawMatch = {
  num?: number;
  date: string;
  time?: string;
  team1?: RawTeam;
  team2?: RawTeam;
  score?: { ft?: number[]; et?: number[]; p?: number[]; ht?: number[] } | null;
  round?: string;
  group?: string;
  venue?: string;
  ground?: string;
  goals1?: { name: string; minute: string; penalty?: boolean; owngoal?: boolean }[];
  goals2?: { name: string; minute: string; penalty?: boolean; owngoal?: boolean }[];
  kickoffUtc?: string | null;
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

export const TEAM_TO_ISO: Record<string, string> = {
  // --- Already in FLAGS ---
  'France': 'fr', 'Portugal': 'pt', 'Spain': 'es',
  'England': 'gb-eng', 'Brazil': 'br', 'Argentina': 'ar',
  'Germany': 'de', 'Netherlands': 'nl', 'Belgium': 'be',
  'Croatia': 'hr', 'Morocco': 'ma', 'USA': 'us',
  'United States': 'us', 'Mexico': 'mx', 'Japan': 'jp',
  'Senegal': 'sn', 'DR Congo': 'cd', 'South Africa': 'za',
  'Algeria': 'dz', 'Switzerland': 'ch', 'Austria': 'at',
  'Sweden': 'se', 'Norway': 'no', 'Canada': 'ca',
  'Australia': 'au', 'Colombia': 'co', 'Ecuador': 'ec',
  'Uruguay': 'uy', 'South Korea': 'kr', 'Korea Republic': 'kr',
  'Saudi Arabia': 'sa', 'Iran': 'ir', 'IR Iran': 'ir',
  'Ivory Coast': 'ci', "Côte d'Ivoire": 'ci', "Cote d'Ivoire": 'ci',
  'Cape Verde': 'cv',
  // --- Previously missing (17 teams) ---
  'Ghana': 'gh', 'Egypt': 'eg', 'Paraguay': 'py',
  'Czech Republic': 'cz',
  'Bosnia & Herzegovina': 'ba', 'Bosnia and Herzegovina': 'ba',
  'Qatar': 'qa', 'Scotland': 'gb-sct', 'Haiti': 'ht',
  'Turkey': 'tr', 'Curaçao': 'cw', 'Curacao': 'cw',
  'Tunisia': 'tn', 'New Zealand': 'nz', 'Iraq': 'iq',
  'Jordan': 'jo', 'Uzbekistan': 'uz', 'Panama': 'pa',
  // --- Name variants from worldcup26.ir ---
  'Democratic Republic of the Congo': 'cd', 'Congo DR': 'cd',
};
