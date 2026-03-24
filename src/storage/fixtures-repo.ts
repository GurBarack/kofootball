import { getDb } from './db.js';
import type { ApiFixture } from '../fetcher/types.js';

export interface FixtureRow {
  id: number;
  league_id: number;
  fixture_id: number;
  home_team: string;
  home_team_id: number | null;
  home_logo: string | null;
  away_team: string;
  away_team_id: number | null;
  away_logo: string | null;
  home_goals: number | null;
  away_goals: number | null;
  status: string;
  date: string;
  round: string | null;
  fetched_at: string;
}

export function saveFixtures(leagueId: number, fixtures: ApiFixture[]): void {
  const db = getDb();
  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO fixtures
      (league_id, fixture_id, home_team, home_team_id, home_logo, away_team, away_team_id, away_logo,
       home_goals, away_goals, status, date, round, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fixture_id) DO UPDATE SET
      home_goals = excluded.home_goals,
      away_goals = excluded.away_goals,
      status = excluded.status,
      fetched_at = excluded.fetched_at
  `);

  const tx = db.transaction(() => {
    for (const f of fixtures) {
      upsert.run(
        leagueId, f.fixture.id,
        f.teams.home.name, f.teams.home.id, f.teams.home.logo,
        f.teams.away.name, f.teams.away.id, f.teams.away.logo,
        f.goals.home, f.goals.away,
        f.fixture.status.short, f.fixture.date, f.league.round, now
      );
    }
  });
  tx();
}

export function getRecentResults(leagueId: number, limit = 10): FixtureRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM fixtures
    WHERE league_id = ? AND status = 'FT'
    ORDER BY date DESC
    LIMIT ?
  `).all(leagueId, limit) as FixtureRow[];
}

export function getUpcomingFixtures(leagueId: number, limit = 10): FixtureRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM fixtures
    WHERE league_id = ? AND status = 'NS'
    ORDER BY date ASC
    LIMIT ?
  `).all(leagueId, limit) as FixtureRow[];
}
