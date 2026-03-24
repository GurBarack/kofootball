import { config } from '../config.js';
import { http } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { getDb } from '../storage/db.js';
import type { ApiStandingRow, ApiFixture } from './types.js';

// ── SQLite-backed rate limiter (shared across processes) ────────────────

const WINDOW_SEC = 60;
const MAX_PER_WINDOW = config.footballData.rateLimitPerMin;
let totalRequests = 0;

/** Count requests made by ANY process in the last 60 seconds */
function recentRequestCount(): number {
  const db = getDb();
  const cutoff = new Date(Date.now() - WINDOW_SEC * 1000).toISOString();
  const row = db.prepare(
    'SELECT COUNT(*) as cnt FROM api_requests WHERE requested_at > ?',
  ).get(cutoff) as { cnt: number };
  return row.cnt;
}

/** Record a request timestamp in the DB */
function recordRequest(): void {
  const db = getDb();
  db.prepare('INSERT INTO api_requests (requested_at) VALUES (?)').run(new Date().toISOString());
  totalRequests++;

  // Prune old rows (older than 2 minutes) to keep the table small
  const cutoff = new Date(Date.now() - 120_000).toISOString();
  db.prepare('DELETE FROM api_requests WHERE requested_at < ?').run(cutoff);
}

/** Wait until a rate limit slot is available */
async function waitForSlot(): Promise<void> {
  let count = recentRequestCount();
  while (count >= MAX_PER_WINDOW) {
    // Find the oldest request in the window to calculate wait time
    const db = getDb();
    const cutoff = new Date(Date.now() - WINDOW_SEC * 1000).toISOString();
    const oldest = db.prepare(
      'SELECT requested_at FROM api_requests WHERE requested_at > ? ORDER BY requested_at ASC LIMIT 1',
    ).get(cutoff) as { requested_at: string } | undefined;

    const waitMs = oldest
      ? Math.max(new Date(oldest.requested_at).getTime() + WINDOW_SEC * 1000 - Date.now() + 500, 1000)
      : 10_000;

    logger.info({ waitMs, used: count, limit: MAX_PER_WINDOW }, 'Rate limit — waiting for slot');
    await new Promise(r => setTimeout(r, waitMs));
    count = recentRequestCount();
  }
  logger.info({ used: count, limit: MAX_PER_WINDOW }, 'Rate limit slot available');
}

const MAX_RETRIES = 2;

async function apiGet<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await waitForSlot();
    recordRequest();

    try {
      const resp = await http.get<T>(`${config.footballData.baseUrl}${path}`, {
        headers: { 'X-Auth-Token': config.footballData.key },
      });
      return resp.data;
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; headers?: Record<string, string> } };
      if (axiosErr.response?.status === 429) {
        const resetSec = Number(axiosErr.response.headers?.['x-requestcounter-reset'] || 60);
        logger.warn({ attempt, resetSec, path }, '429 rate limited — backing off');
        await new Promise(r => setTimeout(r, (resetSec + 1) * 1000));
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
