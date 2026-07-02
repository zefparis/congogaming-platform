export type RawTeam = string | { name?: string; code?: string };

export type RawMatch = {
  num?: number;
  date: string;
  time?: string;
  team1?: RawTeam;
  team2?: RawTeam;
  score?: { ft?: number[] } | null;
  round?: string;
  group?: string;
};

export function teamName(t: RawTeam | undefined): string {
  if (!t) return '?';
  if (typeof t === 'string') return t;
  return t.name ?? '?';
}
