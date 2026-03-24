import { getDb } from './db.js';
import type { ApiStandingRow } from '../fetcher/types.js';

export interface StandingRow {
  id: number;
  league_id: number;
  season: number;
  team_id: number;
  team_name: string;
  team_logo: string | null;
  rank: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goal_diff: number;
  form: string | null;
  fetched_at: string;
}

export function saveStandings(leagueId: number, season: number, rows: ApiStandingRow[]): void {
  const db = getDb();
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO standings_snapshots
      (league_id, season, team_id, team_name, team_logo, rank, points, played, won, drawn, lost, goal_diff, form, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const r of rows) {
      insert.run(
        leagueId, season, r.team.id, r.team.name, r.team.logo,
        r.rank, r.points, r.all.played, r.all.win, r.all.draw, r.all.lose,
        r.goalsDiff, r.form, now
      );
    }
  });
  tx();
}

export function getLatestStandings(leagueId: number): StandingRow[] {
  const db = getDb();
  const latestFetch = db.prepare(`
    SELECT MAX(fetched_at) as latest FROM standings_snapshots WHERE league_id = ?
  `).get(leagueId) as { latest: string | null } | undefined;

  if (!latestFetch?.latest) return [];

  return db.prepare(`
    SELECT * FROM standings_snapshots
    WHERE league_id = ? AND fetched_at = ?
    ORDER BY rank ASC
  `).all(leagueId, latestFetch.latest) as StandingRow[];
}
