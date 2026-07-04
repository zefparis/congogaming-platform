import { supabaseAdmin } from './supabase.js';
import { fetchLiveMatches } from '../routes/predictions.js';
import { finalScore, isPlayed, teamName } from '../../src/screens/predictionsShared.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type NormalizedMatch = {
  id: string;
  competitionId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  kickoffUtc: string | null;
  venue?: string;
  round?: string;
  status: 'scheduled' | 'live' | 'finished';
  homeScore?: number;
  awayScore?: number;
  scorers?: { team: 'home' | 'away'; name: string; minute: string }[];
};

export type CompetitionConfig = {
  id: string;
  display_name: string;
  data_source: 'worldcup2026_legacy' | 'espn';
  espn_slug: string | null;
  active: boolean;
  display_order: number;
};

// ── Competition lookup ────────────────────────────────────────────────────────

export async function getActiveCompetitions(): Promise<CompetitionConfig[]> {
  const { data, error } = await supabaseAdmin
    .from('competitions')
    .select('id, display_name, data_source, espn_slug, active, display_order')
    .eq('active', true)
    .order('display_order', { ascending: true });
  if (error) {
    console.error('[matchSources] Failed to fetch competitions:', error.message);
    return [];
  }
  return (data ?? []) as CompetitionConfig[];
}

export async function getCompetitionById(id: string): Promise<CompetitionConfig | null> {
  const { data, error } = await supabaseAdmin
    .from('competitions')
    .select('id, display_name, data_source, espn_slug, active, display_order')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as CompetitionConfig;
}

// ── ESPN scoreboard fetcher ───────────────────────────────────────────────────

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

type EspnEvent = Record<string, unknown>;
type EspnCompetitor = Record<string, unknown>;
type EspnDetail = Record<string, unknown>;

function parseEspnStatus(state: string | undefined): 'scheduled' | 'live' | 'finished' {
  if (state === 'in') return 'live';
  if (state === 'post') return 'finished';
  return 'scheduled';
}

function parseEspnScorers(
  details: EspnDetail[] | undefined,
  homeId: string,
  awayId: string,
): { team: 'home' | 'away'; name: string; minute: string }[] {
  if (!details) return [];
  const scorers: { team: 'home' | 'away'; name: string; minute: string }[] = [];
  for (const d of details) {
    if (d.scoringPlay !== true && d.type !== 'goal' && !d.athletesInvolved) continue;
    const athletes = (d.athletesInvolved as Record<string, unknown>[]) ?? [];
    const scorer = athletes.find(a => a.type === 'scorer' || !a.type) ?? athletes[0];
    if (!scorer) continue;
    const scorerTeam = (scorer.team as Record<string, unknown>) ?? {};
    const detailTeam = (d.team as Record<string, unknown>) ?? {};
    const teamId = String(scorerTeam.id ?? detailTeam.id ?? '');
    const team: 'home' | 'away' = teamId === homeId ? 'home' : teamId === awayId ? 'away' : 'home';
    const name = String(scorer.displayName ?? scorer.shortName ?? 'Unknown');
    const clockObj = (d.clock as Record<string, unknown>) ?? {};
    const minute = String(clockObj.displayValue ?? d.clock ?? '');
    const isOwnGoal = d.ownGoal === true;
    scorers.push({ team, name: isOwnGoal ? `${name} (OG)` : name, minute });
  }
  return scorers;
}

export async function fetchEspnScoreboard(slug: string, competitionId: string): Promise<NormalizedMatch[]> {
  try {
    const res = await fetch(`${ESPN_BASE}/${slug}/scoreboard`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[matchSources] ESPN ${slug} returned ${res.status}`);
      return [];
    }
    const data = await res.json() as { events?: EspnEvent[] };
    const events = (data.events ?? []) as EspnEvent[];

    return events.map((e) => {
      const comp = (e.competitions as EspnEvent[])?.[0] ?? {};
      const competitors = (comp.competitors as EspnCompetitor[]) ?? [];
      const home = competitors.find(c => c.homeAway === 'home') ?? competitors[0] ?? {};
      const away = competitors.find(c => c.homeAway === 'away') ?? competitors[1] ?? {};
      const homeTeam = (home.team as Record<string, unknown>) ?? {};
      const awayTeam = (away.team as Record<string, unknown>) ?? {};
      const status = (comp.status as Record<string, unknown>)?.type as Record<string, unknown> ?? {};
      const venue = (comp.venue as Record<string, unknown>) ?? (e.venue as Record<string, unknown>);

      const homeScore = home.score != null ? parseInt(String(home.score), 10) : undefined;
      const awayScore = away.score != null ? parseInt(String(away.score), 10) : undefined;
      const homeId = String(homeTeam.id ?? '');
      const awayId = String(awayTeam.id ?? '');

      const details = (comp.details as EspnDetail[]) ?? undefined;
      const scorers = parseEspnScorers(details, homeId, awayId);

      return {
        id: String(e.id ?? ''),
        competitionId,
        homeTeam: String(homeTeam.displayName ?? homeTeam.shortDisplayName ?? ''),
        awayTeam: String(awayTeam.displayName ?? awayTeam.shortDisplayName ?? ''),
        homeTeamLogo: homeTeam.logo ? String(homeTeam.logo) : undefined,
        awayTeamLogo: awayTeam.logo ? String(awayTeam.logo) : undefined,
        kickoffUtc: e.date ? String(e.date) : null,
        venue: venue?.fullName ? String(venue.fullName) : undefined,
        round: e.shortName ? String(e.shortName) : undefined,
        status: parseEspnStatus(String(status?.state ?? '')),
        homeScore,
        awayScore,
        scorers: scorers.length > 0 ? scorers : undefined,
      } as NormalizedMatch;
    });
  } catch (err) {
    console.error(`[matchSources] ESPN fetch failed for ${slug}:`, err);
    return [];
  }
}

// ── World Cup legacy fetcher (encapsulates existing logic untouched) ──────────

const OPENFOOTBALL_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

type MatchRaw = {
  num?: number;
  date: string;
  time?: string;
  team1?: unknown;
  team2?: unknown;
  score?: { ft?: number[]; ht?: number[]; et?: number[]; p?: number[] } | null;
  group?: string;
  round?: string;
  goals1?: { name: string; minute: string }[];
  goals2?: { name: string; minute: string }[];
  ground?: string;
  [key: string]: unknown;
};

function parseMatchDateTime(date: string, time?: string): string | null {
  if (!time) return null;
  const match = time.match(/(\d{1,2}):(\d{2})\s*UTC([+-]\d+)/);
  if (!match) return null;
  const [, hh, mm, offset] = match;
  const utcHour = parseInt(hh, 10) - parseInt(offset, 10);
  const dt = new Date(`${date}T00:00:00Z`);
  dt.setUTCHours(utcHour, parseInt(mm, 10), 0, 0);
  return dt.toISOString();
}

export async function fetchWorldcupMatches(): Promise<NormalizedMatch[]> {
  try {
    const res = await fetch(OPENFOOTBALL_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const json = await res.json() as { matches?: MatchRaw[] };
    const matches = json.matches ?? [];

    // Also fetch live data to determine status
    const liveMatches = await fetchLiveMatches();

    return matches.map((m) => {
      const played = isPlayed(m as any);
      const fs = finalScore(m as any);
      const t1 = teamName(m.team1).toLowerCase();
      const t2 = teamName(m.team2).toLowerCase();
      const live = liveMatches.find(l =>
        l.team1.toLowerCase() === t1 && l.team2.toLowerCase() === t2
      );

      let status: 'scheduled' | 'live' | 'finished' = 'scheduled';
      if (live?.status === 'in_progress') status = 'live';
      else if (played || live?.status === 'final') status = 'finished';

      const homeScore = fs && fs.length >= 2 ? fs[0] : live?.score1;
      const awayScore = fs && fs.length >= 2 ? fs[1] : live?.score2;

      const scorers: { team: 'home' | 'away'; name: string; minute: string }[] = [];
      for (const g of m.goals1 ?? []) scorers.push({ team: 'home', name: g.name, minute: g.minute });
      for (const g of m.goals2 ?? []) scorers.push({ team: 'away', name: g.name, minute: g.minute });
      if (scorers.length === 0 && live) {
        for (const s of live.scorers1 ?? []) scorers.push({ team: 'home', name: s, minute: '' });
        for (const s of live.scorers2 ?? []) scorers.push({ team: 'away', name: s, minute: '' });
      }

      return {
        id: String(m.num ?? ''),
        competitionId: 'worldcup2026',
        homeTeam: teamName(m.team1),
        awayTeam: teamName(m.team2),
        kickoffUtc: parseMatchDateTime(m.date, m.time),
        venue: m.ground,
        round: m.group ?? m.round,
        status,
        homeScore,
        awayScore,
        scorers: scorers.length > 0 ? scorers : undefined,
      } as NormalizedMatch;
    });
  } catch (err) {
    console.error('[matchSources] World Cup fetch failed:', err);
    return [];
  }
}

// ── Unified entry point ───────────────────────────────────────────────────────

export async function fetchMatchesForCompetition(
  competitionId: string,
  competition?: CompetitionConfig | null,
): Promise<NormalizedMatch[]> {
  const comp = competition ?? await getCompetitionById(competitionId);
  if (!comp) {
    console.error(`[matchSources] Unknown competition: ${competitionId}`);
    return [];
  }

  if (comp.data_source === 'worldcup2026_legacy') {
    return fetchWorldcupMatches();
  }

  if (comp.data_source === 'espn' && comp.espn_slug) {
    return fetchEspnScoreboard(comp.espn_slug, competitionId);
  }

  console.error(`[matchSources] No valid data source for ${competitionId}`);
  return [];
}

// ── Cache layer (per-competition) ─────────────────────────────────────────────

const matchCacheMap = new Map<string, { data: NormalizedMatch[]; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function fetchMatchesForCompetitionCached(
  competitionId: string,
): Promise<NormalizedMatch[]> {
  const now = Date.now();
  const cached = matchCacheMap.get(competitionId);
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }
  const data = await fetchMatchesForCompetition(competitionId);
  matchCacheMap.set(competitionId, { data, fetchedAt: now });
  return data;
}
