import { describe, it, expect } from 'vitest';
import { generateHashtags, teamNameToHashtag } from '../../src/content/hashtags.js';
import type { ScoredStory } from '../../src/detection/detector.js';

function makeStory(overrides: Partial<ScoredStory> = {}): ScoredStory {
  return {
    type: 'title_race',
    league_id: 39,
    headline: 'Test headline',
    score: 75,
    payload: {
      teams: [
        { name: 'Arsenal', rank: 1, points: 76 },
        { name: 'Manchester City', rank: 2, points: 74 },
      ],
      pointGap: 2,
      gamesLeft: 6,
    },
    ...overrides,
  };
}

describe('generateHashtags', () => {
  it('produces league + clubs + context for title_race', () => {
    const tags = generateHashtags(makeStory());
    expect(tags).toEqual(['#PremierLeague', '#Arsenal', '#ManCity', '#TitleRace']);
  });

  it('league tag is always first', () => {
    const tags = generateHashtags(makeStory());
    expect(tags[0]).toBe('#PremierLeague');
  });

  it('returns max 4 hashtags', () => {
    const story = makeStory({
      payload: {
        teams: [
          { name: 'Arsenal', rank: 1, points: 76 },
          { name: 'Manchester City', rank: 2, points: 74 },
          { name: 'Liverpool', rank: 3, points: 72 },
        ],
        pointGap: 4,
        gamesLeft: 6,
      },
    });
    const tags = generateHashtags(story);
    expect(tags.length).toBeLessThanOrEqual(4);
  });

  it('produces no duplicates (case-insensitive)', () => {
    const tags = generateHashtags(makeStory());
    const lowerSet = new Set(tags.map(t => t.toLowerCase()));
    expect(lowerSet.size).toBe(tags.length);
  });

  it('handles La Liga league', () => {
    const tags = generateHashtags(makeStory({ league_id: 140 }));
    expect(tags[0]).toBe('#LaLiga');
  });

  it('handles relegation story type', () => {
    const story = makeStory({
      type: 'relegation',
      payload: {
        teams: [
          { name: 'Leicester City', rank: 18, points: 20 },
          { name: 'Sheffield United', rank: 19, points: 18 },
        ],
        cutoffRank: 18,
        gamesLeft: 6,
      },
    });
    const tags = generateHashtags(story);
    expect(tags).toContain('#PremierLeague');
    expect(tags).toContain('#Leicester');
    expect(tags).toContain('#RelegationBattle');
  });

  it('handles momentum story with single team', () => {
    const story = makeStory({
      type: 'momentum',
      payload: { team: 'Liverpool', form: 'WWWWW', rank: 3, points: 72, streakType: 'hot', winsInLast5: 5 },
    });
    const tags = generateHashtags(story);
    expect(tags).toContain('#PremierLeague');
    expect(tags).toContain('#Liverpool');
    // momentum has no context hashtag, so ≤ 2 tags
    expect(tags.length).toBe(2);
  });

  it('handles critical_fixture with fixture payload', () => {
    const story = makeStory({
      type: 'critical_fixture',
      payload: {
        fixture: { home: 'Arsenal', away: 'Manchester City', date: '2026-04-01', round: 'Matchday 30' },
        homeStanding: { rank: 1, points: 76, form: 'WWDWW' },
        awayStanding: { rank: 2, points: 74, form: 'WLWWW' },
        context: 'title/European',
        pointGap: 2,
      },
    });
    const tags = generateHashtags(story);
    expect(tags).toContain('#PremierLeague');
    expect(tags).toContain('#Arsenal');
    expect(tags).toContain('#ManCity');
    // critical_fixture has no context hashtag
    expect(tags.length).toBe(3);
  });

  it('handles unknown league gracefully', () => {
    const tags = generateHashtags(makeStory({ league_id: 999 }));
    // No league tag, still has club + context tags
    expect(tags[0]).toBe('#Arsenal');
  });
});

describe('teamNameToHashtag', () => {
  it('uses alias map for known teams', () => {
    expect(teamNameToHashtag('Manchester City')).toBe('#ManCity');
    expect(teamNameToHashtag('Real Madrid')).toBe('#RealMadrid');
    expect(teamNameToHashtag('Tottenham Hotspur')).toBe('#Spurs');
    expect(teamNameToHashtag('Borussia Dortmund')).toBe('#BVB');
  });

  it('strips spaces for unknown teams', () => {
    expect(teamNameToHashtag('Fulham')).toBe('#Fulham');
    expect(teamNameToHashtag('Ipswich Town')).toBe('#IpswichTown');
  });
});
