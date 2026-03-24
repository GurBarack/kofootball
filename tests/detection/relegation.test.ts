import { describe, it, expect } from 'vitest';
import { detectRelegation } from '../../src/detection/rules/relegation.js';
import type { StandingRow } from '../../src/storage/standings-repo.js';
import standings from '../fixtures/standings-sample.json';

const PL = 39;

describe('detectRelegation', () => {
  it('detects relegation battle from full 20-team standings', () => {
    const rows = standings.premierLeague.tightTitleRace as unknown as StandingRow[];
    const stories = detectRelegation(PL, rows);

    expect(stories).toHaveLength(1);
    expect(stories[0].type).toBe('relegation');
    expect(stories[0].league_id).toBe(PL);

    const payload = stories[0].payload as Record<string, unknown>;
    const teams = payload.teams as Array<Record<string, unknown>>;

    // Bottom teams near the cutoff (rank 18 = first relegation spot)
    // cutoffTeam is rank 17 (first safe above zone)
    // teams within 5pts of cutoff should be in danger
    expect(teams.length).toBeGreaterThanOrEqual(3);
    expect(payload.gamesLeft).toBe(6);
  });

  it('returns empty when fewer than 10 teams', () => {
    const rows = standings.premierLeague.tightTitleRace.slice(0, 5) as unknown as StandingRow[];
    const stories = detectRelegation(PL, rows);
    expect(stories).toHaveLength(0);
  });

  it('headline describes the relegation battle', () => {
    const rows = standings.premierLeague.tightTitleRace as unknown as StandingRow[];
    const stories = detectRelegation(PL, rows);

    if (stories.length > 0) {
      expect(stories[0].headline).toMatch(/Relegation battle/i);
      expect(stories[0].headline).toMatch(/teams within/);
    }
  });

  it('includes cutoffRank in payload', () => {
    const rows = standings.premierLeague.tightTitleRace as unknown as StandingRow[];
    const stories = detectRelegation(PL, rows);

    if (stories.length > 0) {
      const payload = stories[0].payload as Record<string, unknown>;
      expect(payload.cutoffRank).toBeDefined();
      expect(typeof payload.cutoffRank).toBe('number');
    }
  });
});
