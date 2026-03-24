import { describe, it, expect } from 'vitest';
import { detectTitleRace } from '../../src/detection/rules/title-race.js';
import type { StandingRow } from '../../src/storage/standings-repo.js';
import standings from '../fixtures/standings-sample.json';

const PL = 39;

describe('detectTitleRace', () => {
  it('detects a 3-team title race within 6pt gap', () => {
    const rows = standings.premierLeague.tightTitleRace as unknown as StandingRow[];
    const stories = detectTitleRace(PL, rows);

    expect(stories).toHaveLength(1);
    expect(stories[0].type).toBe('title_race');
    expect(stories[0].league_id).toBe(PL);

    const payload = stories[0].payload as Record<string, unknown>;
    const teams = payload.teams as Array<Record<string, unknown>>;
    expect(teams).toHaveLength(3); // Arsenal, Man City, Liverpool (within 6pts)
    expect(teams[0].name).toBe('Arsenal');
    expect(teams[1].name).toBe('Man City');
    expect(teams[2].name).toBe('Liverpool');
    expect(payload.pointGap).toBe(3); // 76 - 73
    expect(payload.gamesLeft).toBe(6); // 38 - 32
  });

  it('detects a 2-team title race (1pt gap, 3 games left)', () => {
    const rows = standings.premierLeague.twoTeamRace as unknown as StandingRow[];
    const stories = detectTitleRace(PL, rows);

    expect(stories).toHaveLength(1);
    const payload = stories[0].payload as Record<string, unknown>;
    const teams = payload.teams as Array<Record<string, unknown>>;
    expect(teams).toHaveLength(2); // Arsenal 80, Liverpool 79 (Man City at 70 is >6pt gap)
    expect(payload.pointGap).toBe(1);
    expect(payload.gamesLeft).toBe(3);
  });

  it('returns empty when leader is >6pts ahead', () => {
    const rows = standings.premierLeague.noTitleRace as unknown as StandingRow[];
    const stories = detectTitleRace(PL, rows);

    // Man City at 85, Arsenal at 70 = 15pt gap → no race
    expect(stories).toHaveLength(0);
  });

  it('returns empty when standings have fewer than 3 teams', () => {
    const rows = [
      standings.premierLeague.tightTitleRace[0],
      standings.premierLeague.tightTitleRace[1],
    ] as unknown as StandingRow[];
    const stories = detectTitleRace(PL, rows);
    expect(stories).toHaveLength(0);
  });

  it('includes correct headline format', () => {
    const rows = standings.premierLeague.tightTitleRace as unknown as StandingRow[];
    const stories = detectTitleRace(PL, rows);
    expect(stories[0].headline).toMatch(/Arsenal vs Man City vs Liverpool/);
    expect(stories[0].headline).toMatch(/3pt gap/);
    expect(stories[0].headline).toMatch(/6 games left/);
  });
});
