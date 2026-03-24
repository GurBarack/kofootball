import { config } from '../config.js';
import { http } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import type { ApiStandingRow, ApiFixture } from './types.js';

// ── Per-minute rate limiting ────────────────────────────────────────────

let requestTimestamps: number[] = [];
let totalRequests = 0;

function canRequest(): boolean {
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter(t => now - t < 60_000);
  return requestTimestamps.length < config.footballData.rateLimitPerMin;
}

async function waitForSlot(): Promise<void> {
  while (!canRequest()) {
    const oldest = requestTimestamps[0];
    const waitMs = 60_000 - (Date.now() - oldest) + 100;
    logger.info({ waitMs }, 'Rate limit — waiting');
    await new Promise(r => setTimeout(r, waitMs));
  }
}

function trackRequest(): void {
  requestTimestamps.push(Date.now());
  totalRequests++;
  logger.info({ totalRequests }, 'API request count');
}

async function apiGet<T>(path: string): Promise<T> {
  await waitForSlot();
  trackRequest();

  const { data } = await http.get<T>(`${config.footballData.baseUrl}${path}`, {
    headers: { 'X-Auth-Token': config.footballData.key },
  });
  return data;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function getCompetitionCode(leagueId: number): string {
  const code = config.leagueCodeMap[leagueId];
  if (!code) throw new Error(`No Football-Data.org code mapped for league ${leagueId}`);
  return code;
}

/** Convert "W,W,D,L,L" → "WWDLL", or null if missing */
function normalizeForm(form: string | null | undefined): string | null {
  if (!form) return null;
  return form.replace(/,/g, '');
}

/** Map Football-Data.org status to short codes used internally */
function mapStatus(status: string): string {
  switch (status) {
    case 'FINISHED': return 'FT';
    case 'TIMED':
    case 'SCHEDULED': return 'NS';
    case 'IN_PLAY': return '1H';
    case 'PAUSED': return 'HT';
    case 'POSTPONED': return 'PST';
    case 'CANCELLED': return 'CANC';
    default: return status;
  }
}

// ── Public API (same signatures consumed by pipeline/seed) ──────────────

interface FDStandingsResponse {
  season: { id: number };
  standings: Array<{
    type: string;
    table: Array<{
      position: number;
      team: { id: number; name: string; shortName: string; crest: string };
      playedGames: number;
      form: string | null;
      won: number;
      draw: number;
      lost: number;
      points: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDifference: number;
    }>;
  }>;
}

interface FDMatchesResponse {
  matches: Array<{
    id: number;
    utcDate: string;
    status: string;
    matchday: number;
    homeTeam: { id: number; name: string; shortName: string; crest: string };
    awayTeam: { id: number; name: string; shortName: string; crest: string };
    score: { fullTime: { home: number | null; away: number | null } };
  }>;
}

export async function fetchStandings(leagueId: number): Promise<ApiStandingRow[]> {
  const code = getCompetitionCode(leagueId);
  logger.info({ leagueId, code }, 'Fetching standings');

  const data = await apiGet<FDStandingsResponse>(`/competitions/${code}/standings`);

  // Use TOTAL standings (not HOME/AWAY splits)
  const total = data.standings?.find(s => s.type === 'TOTAL');
  if (!total) return [];

  return total.table.map(row => ({
    rank: row.position,
    team: { id: row.team.id, name: row.team.name, logo: row.team.crest },
    points: row.points,
    goalsDiff: row.goalDifference,
    form: normalizeForm(row.form),
    all: { played: row.playedGames, win: row.won, draw: row.draw, lose: row.lost },
  }));
}

export async function fetchRecentFixtures(leagueId: number): Promise<ApiFixture[]> {
  const code = getCompetitionCode(leagueId);
  logger.info({ leagueId, code }, 'Fetching recent fixtures');

  const data = await apiGet<FDMatchesResponse>(
    `/competitions/${code}/matches?status=FINISHED&limit=10`,
  );

  return (data.matches || []).map(m => ({
    fixture: { id: m.id, date: m.utcDate, status: { short: mapStatus(m.status) } },
    league: { id: leagueId, round: `Matchday ${m.matchday}` },
    teams: {
      home: { id: m.homeTeam.id, name: m.homeTeam.name, logo: m.homeTeam.crest },
      away: { id: m.awayTeam.id, name: m.awayTeam.name, logo: m.awayTeam.crest },
    },
    goals: { home: m.score.fullTime.home, away: m.score.fullTime.away },
  }));
}

export async function fetchUpcomingFixtures(leagueId: number): Promise<ApiFixture[]> {
  const code = getCompetitionCode(leagueId);
  logger.info({ leagueId, code }, 'Fetching upcoming fixtures');

  const data = await apiGet<FDMatchesResponse>(
    `/competitions/${code}/matches?status=SCHEDULED,TIMED&limit=10`,
  );

  return (data.matches || []).map(m => ({
    fixture: { id: m.id, date: m.utcDate, status: { short: mapStatus(m.status) } },
    league: { id: leagueId, round: `Matchday ${m.matchday}` },
    teams: {
      home: { id: m.homeTeam.id, name: m.homeTeam.name, logo: m.homeTeam.crest },
      away: { id: m.awayTeam.id, name: m.awayTeam.name, logo: m.awayTeam.crest },
    },
    goals: { home: null, away: null },
  }));
}

export function getRequestCount(): number {
  return totalRequests;
}
