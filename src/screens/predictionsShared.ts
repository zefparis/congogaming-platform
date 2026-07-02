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
  score?: { ft?: number[] } | null;
  round?: string;
  group?: string;
  venue?: string;
};

export function teamName(t: RawTeam | undefined): string {
  if (!t) return '?';
  if (typeof t === 'string') return t;
  return t.name ?? '?';
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
