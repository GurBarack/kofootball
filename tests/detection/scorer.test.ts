import { describe, it, expect } from 'vitest';
import { scoreStory } from '../../src/detection/scorer.js';
import type { DetectedStory } from '../../src/detection/detector.js';
import type { StandingRow } from '../../src/storage/standings-repo.js';
import storySamples from '../fixtures/stories-sample.json';
import standingSamples from '../fixtures/standings-sample.json';

const standings = standingSamples.premierLeague.tightTitleRace as unknown as StandingRow[];

describe('scoreStory', () => {
  it('scores a tight title race highly (small gap + late season)', () => {
    const story = storySamples.titleRaceStory as unknown as DetectedStory;
    const score = scoreStory(story, standings);

    // 3pt gap → tightness ~20, 6 games left → timing ~22, drama base 10, magnitude ~12 (3 teams + title_race)
    expect(score).toBeGreaterThanOrEqual(55);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('scores are bounded 0-100', () => {
    const story = storySamples.titleRaceStory as unknown as DetectedStory;
    const score = scoreStory(story, standings);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('tighter gaps produce higher scores', () => {
    const tightStory: DetectedStory = {
      type: 'title_race',
      league_id: 39,
      headline: 'test',
      payload: { pointGap: 1, gamesLeft: 5, teams: [{ name: 'A' }, { name: 'B' }] },
    };
    const looseStory: DetectedStory = {
      type: 'title_race',
      league_id: 39,
      headline: 'test',
      payload: { pointGap: 6, gamesLeft: 5, teams: [{ name: 'A' }, { name: 'B' }] },
    };

    const tightScore = scoreStory(tightStory, standings);
    const looseScore = scoreStory(looseStory, standings);
    expect(tightScore).toBeGreaterThan(looseScore);
  });

  it('late season produces higher timing scores', () => {
    const lateStory: DetectedStory = {
      type: 'title_race',
      league_id: 39,
      headline: 'test',
      payload: { pointGap: 3, gamesLeft: 2, teams: [{ name: 'A' }, { name: 'B' }] },
    };
    const earlyStory: DetectedStory = {
      type: 'title_race',
      league_id: 39,
      headline: 'test',
      payload: { pointGap: 3, gamesLeft: 20, teams: [{ name: 'A' }, { name: 'B' }] },
    };

    const lateScore = scoreStory(lateStory, standings);
    const earlyScore = scoreStory(earlyStory, standings);
    expect(lateScore).toBeGreaterThan(earlyScore);
  });

  it('momentum stories with 5-game streak score drama bonus', () => {
    const hotStreak: DetectedStory = {
      type: 'momentum',
      league_id: 39,
      headline: 'test',
      payload: { streakType: 'hot', winsInLast5: 5, lossesInLast5: 0, rank: 16, gamesLeft: 6, pointGap: 3 },
    };
    const mildForm: DetectedStory = {
      type: 'momentum',
      league_id: 39,
      headline: 'test',
      payload: { streakType: 'hot', winsInLast5: 3, lossesInLast5: 1, rank: 10, gamesLeft: 6, pointGap: 3 },
    };

    const hotScore = scoreStory(hotStreak, standings);
    const mildScore = scoreStory(mildForm, standings);
    expect(hotScore).toBeGreaterThan(mildScore);
  });

  it('more teams in story increases magnitude', () => {
    const fourTeams: DetectedStory = {
      type: 'title_race',
      league_id: 39,
      headline: 'test',
      payload: { pointGap: 3, gamesLeft: 6, teams: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] },
    };
    const twoTeams: DetectedStory = {
      type: 'title_race',
      league_id: 39,
      headline: 'test',
      payload: { pointGap: 3, gamesLeft: 6, teams: [{ name: 'A' }, { name: 'B' }] },
    };

    const fourScore = scoreStory(fourTeams, standings);
    const twoScore = scoreStory(twoTeams, standings);
    expect(fourScore).toBeGreaterThan(twoScore);
  });

  it('zero-point gap gives maximum tightness score', () => {
    const story: DetectedStory = {
      type: 'title_race',
      league_id: 39,
      headline: 'test',
      payload: { pointGap: 0, gamesLeft: 3, teams: [{ name: 'A' }, { name: 'B' }] },
    };
    const score = scoreStory(story, standings);
    // 0pt gap (30) + 3 games left (25) + drama base (10) + magnitude (12) = 77
    expect(score).toBeGreaterThanOrEqual(70);
  });
});
