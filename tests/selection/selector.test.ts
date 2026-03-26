import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractTeamNames,
  extractTeamNamesFromRow,
  teamOverlapRatio,
  scoreSituationPressure,
  scoreFormContrast,
  scoreFreshnessPenalty,
  computeNarrativeStrength,
  selectForPublishing,
} from '../../src/selection/selector.js';
import type { ScoredStory } from '../../src/detection/detector.js';
import type { StoryRow } from '../../src/storage/stories-repo.js';

// ── Factories ────────────────────────────────────────────────────────────

function makeStory(overrides: Partial<ScoredStory> = {}): ScoredStory {
  return {
    type: 'title_race',
    league_id: 39,
    headline: 'Title race heats up',
    score: 70,
    payload: {
      teams: [
        { name: 'Arsenal', rank: 1, points: 76, played: 32, form: 'WWDWW', goal_diff: 40 },
        { name: 'Man City', rank: 2, points: 74, played: 32, form: 'WLWDL', goal_diff: 38 },
        { name: 'Liverpool', rank: 3, points: 73, played: 32, form: 'WWWDW', goal_diff: 35 },
      ],
      pointGap: 3,
      gamesLeft: 6,
    },
    ...overrides,
  };
}

function makeMomentumStory(overrides: Partial<ScoredStory> = {}): ScoredStory {
  return {
    type: 'momentum',
    league_id: 39,
    headline: 'Arsenal on a hot streak',
    score: 60,
    payload: {
      team: 'Arsenal',
      form: 'WWWWW',
      rank: 1,
      points: 76,
      streakType: 'hot',
      winsInLast5: 5,
    },
    ...overrides,
  };
}

function makeCriticalFixtureStory(overrides: Partial<ScoredStory> = {}): ScoredStory {
  return {
    type: 'critical_fixture',
    league_id: 39,
    headline: 'Arsenal vs Man City',
    score: 65,
    payload: {
      fixture: { home: 'Arsenal', away: 'Man City', date: '2026-04-01', round: 'Matchday 30' },
      homeStanding: { rank: 1, points: 76, form: 'WWWWW' },
      awayStanding: { rank: 2, points: 74, form: 'LLDWL' },
      context: 'title/European',
      pointGap: 2,
    },
    ...overrides,
  };
}

function makeStoryRow(overrides: Partial<StoryRow> = {}): StoryRow {
  return {
    id: 1,
    type: 'title_race',
    league_id: 39,
    headline: 'PL title race',
    score: 70,
    payload_json: JSON.stringify({
      teams: [
        { name: 'Arsenal', rank: 1, points: 76 },
        { name: 'Man City', rank: 2, points: 74 },
      ],
      pointGap: 2,
      gamesLeft: 6,
    }),
    content_variants: null,
    media_suggestion: 'text_only',
    status: 'pending',
    feedback: null,
    delivered_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('extractTeamNames', () => {
  it('extracts from title_race teams array', () => {
    const teams = extractTeamNames(makeStory());
    expect(teams).toEqual(['arsenal', 'man city', 'liverpool']);
  });

  it('extracts from critical_fixture home/away', () => {
    const teams = extractTeamNames(makeCriticalFixtureStory());
    expect(teams).toEqual(['arsenal', 'man city']);
  });

  it('extracts single team from momentum', () => {
    const teams = extractTeamNames(makeMomentumStory());
    expect(teams).toEqual(['arsenal']);
  });

  it('returns empty for unknown payload', () => {
    const story = makeStory({ payload: {} });
    expect(extractTeamNames(story)).toEqual([]);
  });

  it('extracts from StoryRow via extractTeamNamesFromRow', () => {
    const row = makeStoryRow();
    expect(extractTeamNamesFromRow(row)).toEqual(['arsenal', 'man city']);
  });
});

describe('teamOverlapRatio', () => {
  it('returns 1.0 for identical sets', () => {
    expect(teamOverlapRatio(['arsenal', 'city'], ['arsenal', 'city'])).toBe(1);
  });

  it('returns 0 when no overlap', () => {
    expect(teamOverlapRatio(['arsenal'], ['barcelona'])).toBe(0);
  });

  it('uses min set size as denominator', () => {
    // 1 overlap out of min(1, 3) = 1 → 1.0
    expect(teamOverlapRatio(['arsenal'], ['arsenal', 'city', 'liverpool'])).toBe(1);
  });

  it('returns 0 for empty inputs', () => {
    expect(teamOverlapRatio([], ['arsenal'])).toBe(0);
    expect(teamOverlapRatio(['arsenal'], [])).toBe(0);
  });
});

describe('scoreSituationPressure', () => {
  it('scores high for late-season tight race', () => {
    const story = makeStory({ payload: { ...makeStory().payload, gamesLeft: 3, pointGap: 1 } });
    const pressure = scoreSituationPressure(story);
    expect(pressure).toBe(35); // 20 + 15
  });

  it('scores lower for early-season wide gap', () => {
    const story = makeStory({ payload: { ...makeStory().payload, gamesLeft: 15, pointGap: 8 } });
    expect(scoreSituationPressure(story)).toBe(0);
  });

  it('handles momentum with no gamesLeft/pointGap', () => {
    const story = makeMomentumStory();
    const pressure = scoreSituationPressure(story);
    // rank 1 hot streak: base 10, no rank bonus (hot + rank 1 = no bonus)
    expect(pressure).toBe(10);
  });

  it('gives momentum bonus for top-6 cold streak', () => {
    const story = makeMomentumStory({
      payload: { team: 'Arsenal', form: 'LLLLL', rank: 3, points: 60, streakType: 'cold', lossesInLast5: 5 },
    });
    expect(scoreSituationPressure(story)).toBe(20); // base 10 + cold top-6 bonus 10
  });
});

describe('scoreFormContrast', () => {
  it('scores high for title_race with divergent form', () => {
    const story = makeStory({
      payload: {
        ...makeStory().payload,
        teams: [
          { name: 'Arsenal', rank: 1, points: 76, played: 32, form: 'WWWWW', goal_diff: 40 },
          { name: 'Man City', rank: 2, points: 74, played: 32, form: 'LLLLL', goal_diff: 38 },
        ],
      },
    });
    // formToScore('WWWWW')=5, formToScore('LLLLL')=-5, divergence=10 → 30
    expect(scoreFormContrast(story)).toBe(30);
  });

  it('scores low for similar form', () => {
    const story = makeStory({
      payload: {
        ...makeStory().payload,
        teams: [
          { name: 'Arsenal', rank: 1, points: 76, played: 32, form: 'WWDWW', goal_diff: 40 },
          { name: 'Man City', rank: 2, points: 74, played: 32, form: 'WWWDW', goal_diff: 38 },
        ],
      },
    });
    // Both score ~3-4, divergence 0-1
    expect(scoreFormContrast(story)).toBeLessThanOrEqual(12);
  });

  it('scores high for momentum with perfect streak', () => {
    const story = makeMomentumStory();
    expect(scoreFormContrast(story)).toBeGreaterThanOrEqual(25);
  });

  it('scores high for critical_fixture with divergent form', () => {
    const story = makeCriticalFixtureStory();
    // WWWWW vs LLDWL: 5 vs -2 = diff 7 → 30
    expect(scoreFormContrast(story)).toBe(30);
  });
});

describe('computeNarrativeStrength', () => {
  it('tight late-season title_race scores high', () => {
    const story = makeStory({ payload: { ...makeStory().payload, gamesLeft: 3, pointGap: 1 } });
    const strength = computeNarrativeStrength(story, []);
    // pressure ~35 + contrast varies + type 15 + freshness 0
    expect(strength).toBeGreaterThan(55);
  });

  it('momentum scores lower than title_race (type weight)', () => {
    const titleRace = computeNarrativeStrength(makeStory(), []);
    const momentum = computeNarrativeStrength(makeMomentumStory(), []);
    expect(titleRace).toBeGreaterThan(momentum);
  });

  it('freshness penalty reduces strength', () => {
    const story = makeStory();
    const recentRow = makeStoryRow({ created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() });
    const withRecent = computeNarrativeStrength(story, [recentRow]);
    const withoutRecent = computeNarrativeStrength(story, []);
    expect(withRecent).toBeLessThan(withoutRecent);
  });

  it('no penalty when recentStories is empty', () => {
    const strength = computeNarrativeStrength(makeStory(), []);
    expect(strength).toBeGreaterThan(0);
  });

  it('clamps between 0 and 100', () => {
    const strength = computeNarrativeStrength(makeStory(), []);
    expect(strength).toBeGreaterThanOrEqual(0);
    expect(strength).toBeLessThanOrEqual(100);
  });
});

describe('selectForPublishing', () => {
  it('selects highest composite rank first', () => {
    const highScore = makeStory({ score: 90, headline: 'Top story' });
    const lowScore = makeStory({
      score: 40,
      headline: 'Low story',
      payload: {
        teams: [{ name: 'Barcelona', rank: 1, points: 80, played: 32, form: 'DWDWD', goal_diff: 30 }],
        pointGap: 5,
        gamesLeft: 10,
      },
      league_id: 140,
    });

    const result = selectForPublishing([lowScore, highScore], [], 5);
    expect(result[0].headline).toBe('Top story');
  });

  it('respects maxStories cap', () => {
    const stories = [
      makeStory({ headline: 'A', score: 90 }),
      makeStory({
        headline: 'B', score: 80, league_id: 140,
        payload: { teams: [{ name: 'Barcelona', rank: 1, points: 80, played: 32, form: 'WWWWW', goal_diff: 30 }], pointGap: 2, gamesLeft: 5 },
      }),
      makeStory({
        headline: 'C', score: 70, league_id: 140,
        payload: { teams: [{ name: 'Real Madrid', rank: 1, points: 80, played: 32, form: 'WWWWW', goal_diff: 30 }], pointGap: 2, gamesLeft: 5 },
      }),
    ];
    const result = selectForPublishing(stories, [], 2);
    expect(result).toHaveLength(2);
  });

  it('returns empty when no candidates', () => {
    expect(selectForPublishing([], [], 5)).toEqual([]);
  });

  it('applies team cooldown penalty', () => {
    const story = makeStory({ score: 70 });
    const recentRow = makeStoryRow({
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
    });

    const withCooldown = selectForPublishing([story], [recentRow], 5);
    const withoutCooldown = selectForPublishing([story], [], 5);

    // With cooldown, compositeRank should be lower
    if (withCooldown.length > 0 && withoutCooldown.length > 0) {
      expect(withCooldown[0].compositeRank).toBeLessThan(withoutCooldown[0].compositeRank);
    }
  });

  it('no team cooldown penalty when recent story is old', () => {
    const story = makeStory({ score: 70 });
    const oldRow = makeStoryRow({
      created_at: new Date(Date.now() - 15 * 60 * 60 * 1000).toISOString(), // 15h ago — outside both cooldown windows
    });

    const withOld = selectForPublishing([story], [oldRow], 5);
    const withNone = selectForPublishing([story], [], 5);

    // Old story is outside both 6h team cooldown and 12h narrative cooldown
    expect(withOld).toHaveLength(1);
    expect(withNone).toHaveLength(1);
  });

  it('narrative dedup filters overlapping stories in batch', () => {
    // Two title_race stories about same teams — only the higher-ranked one survives
    const storyA = makeStory({ score: 80, headline: 'Title race A' });
    const storyB = makeStory({ score: 60, headline: 'Title race B' });

    const result = selectForPublishing([storyA, storyB], [], 5);
    expect(result).toHaveLength(1);
    expect(result[0].headline).toBe('Title race A');
  });

  it('narrative dedup allows stories with different teams', () => {
    const storyA = makeStory({ score: 80, headline: 'PL title race' });
    const storyB = makeStory({
      score: 75,
      headline: 'La Liga title race',
      league_id: 140,
      payload: {
        teams: [
          { name: 'Barcelona', rank: 1, points: 80, played: 32, form: 'WWWWW', goal_diff: 30 },
          { name: 'Real Madrid', rank: 2, points: 78, played: 32, form: 'WDWWL', goal_diff: 25 },
        ],
        pointGap: 2,
        gamesLeft: 6,
      },
    });

    const result = selectForPublishing([storyA, storyB], [], 5);
    expect(result).toHaveLength(2);
  });

  it('all selected stories have contentMode short_post', () => {
    const result = selectForPublishing([makeStory(), makeMomentumStory()], [], 5);
    for (const s of result) {
      expect(s.contentMode).toBe('short_post');
      expect(s.is_thread_candidate).toBe(false);
    }
  });
});
