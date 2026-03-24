import { config } from '../config.js';
import { http } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import type { ApiStandingsResponse, ApiFixturesResponse, ApiStandingRow, ApiFixture } from './types.js';

let requestsToday = 0;
let lastResetDate = '';

function trackRequest(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastResetDate) {
    requestsToday = 0;
    lastResetDate = today;
  }
  requestsToday++;
  logger.info({ requestsToday, limit: config.apiFootball.dailyLimit }, 'API request count');
}

function canRequest(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastResetDate) return true;
  return requestsToday < config.apiFootball.dailyLimit;
}

async function apiGet<T>(endpoint: string, params: Record<string, string | number>): Promise<T> {
  if (!canRequest()) {
    throw new Error(`API-Football daily limit reached (${config.apiFootball.dailyLimit})`);
  }
  trackRequest();

  const { data } = await http.get<T>(`${config.apiFootball.baseUrl}/${endpoint}`, {
    params,
    headers: { 'x-apisports-key': config.apiFootball.key },
  });
  return data;
}

export async function fetchStandings(leagueId: number, season: number): Promise<ApiStandingRow[]> {
  logger.info({ leagueId, season }, 'Fetching standings');
  const data = await apiGet<ApiStandingsResponse>('standings', { league: leagueId, season });
  const standings = data.response?.[0]?.league?.standings?.[0];
  return standings || [];
}

export async function fetchRecentFixtures(leagueId: number, season: number): Promise<ApiFixture[]> {
  logger.info({ leagueId, season }, 'Fetching recent fixtures');
  const data = await apiGet<ApiFixturesResponse>('fixtures', {
    league: leagueId,
    season,
    last: 10,
  });
  return data.response || [];
}

export async function fetchUpcomingFixtures(leagueId: number, season: number): Promise<ApiFixture[]> {
  logger.info({ leagueId, season }, 'Fetching upcoming fixtures');
  const data = await apiGet<ApiFixturesResponse>('fixtures', {
    league: leagueId,
    season,
    next: 10,
  });
  return data.response || [];
}

export function getRequestCount(): number {
  return requestsToday;
}
