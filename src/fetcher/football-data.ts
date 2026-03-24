import { config } from '../config.js';
import { http } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import type { ApiStandingRow, ApiFixture } from './types.js';

// ── Per-minute rate limiting with 429 retry ─────────────────────────────

let requestTimestamps: number[] = [];
let totalRequests = 0;
let serverAvailable: number | null = null; // from X-Requests-Available-Minute header

function canRequest(): boolean {
  // If the server told us we have 0 remaining, respect that
  if (serverAvailable !== null && serverAvailable <= 0) return false;
  const now = Date.now();
  requestTimestamps = requestTimestamps.filter(t => now - t < 60_000);
  return requestTimestamps.length < config.footballData.rateLimitPerMin;
}

async function waitForSlot(): Promise<void> {
  while (!canRequest()) {
    const oldest = requestTimestamps[0];
    const waitMs = oldest ? 60_000 - (Date.now() - oldest) + 500 : 10_000;
    logger.info({ waitMs }, 'Rate limit — waiting');
    await new Promise(r => setTimeout(r, Math.max(waitMs, 1_000)));
    // Reset server counter after waiting
    serverAvailable = null;
  }
}

function trackRequest(): void {
  requestTimestamps.push(Date.now());
  totalRequests++;
  logger.info({ totalRequests }, 'API request count');
}

const MAX_RETRIES = 2;

async function apiGet<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForSlot();
    trackRequest();

    try {
      const resp = await http.get<T>(`${config.footballData.baseUrl}${path}`, {
        headers: { 'X-Auth-Token': config.footballData.key },
      });

      // Track server-side availability
      const avail = resp.headers?.['x-requests-available-minute'];
      if (avail !== undefined) serverAvailable = Number(avail);

      return resp.data;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; headers?: Record<string, string> } };
      if (axiosErr.response?.status === 429) {
        const resetSec = Number(axiosErr.response.headers?.['x-requestcounter-reset'] || 60);
        serverAvailable = 0;
        logger.warn({ attempt, resetSec, path }, '429 rate limited — backing off');
        await new Promise(r => setTimeout(r, (resetSec + 1) * 1000));
        serverAvailable = null;
        continue;
      }
      throw err;
    }
  }
  throw new Error(`API request failed after ${MAX_RETRIES + 1} attempts: ${path}`);
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
