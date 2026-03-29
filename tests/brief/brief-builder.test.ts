import { describe, it, expect } from 'vitest';
import { buildBrief } from '../../src/brief/brief-builder.js';
import type { StoryBrief } from '../../src/brief/brief-builder.js';
import type { PublishableStory } from '../../src/selection/selector.js';

// ── Helpers ─────────────────────────────────────────────────────────────

function makePublishable(overrides: Partial<PublishableStory> = {}): PublishableStory {
  return {
    type: 'title_race',
    league_id: 39,
    headline: 'PL title race: Arsenal lead Man City by 2pts with 6 games left',
    score: 82,
    payload: {
      teams: [
        { name: 'Arsenal', rank: 1, points: 76, played: 32, form: 'WWDWW', goal_diff: 45 },
        { name: 'Manchester City', rank: 2, points: 74, played: 32, form: 'WWWDL', goal_diff: 48 },
        { name: 'Liverpool', rank: 3, points: 72, played: 32, form: 'WLWWW', goal_diff: 42 },
      ],
      pointGap: 4,
      gamesLeft: 6,
    },
    contentMode: 'short_post',
    narrativeStrength: 65,
    compositeRank: 73,
    is_thread_candidate: false,
    ...overrides,
  };
}

// ── Basic structure ─────────────────────────────────────────────────────

describe('buildBrief — structure', () => {
  it('returns all required fields', () => {
    const brief = buildBrief(makePublishable());

    expect(brief).toHaveProperty('entity');
    expect(brief).toHaveProperty('competition');
    expect(brief).toHaveProperty('storyType');
    expect(brief).toHaveProperty('headline');
    expect(brief).toHaveProperty('summary');
    expect(brief).toHaveProperty('whatHappened');
    expect(brief).toHaveProperty('whyItMatters');
    expect(brief).toHaveProperty('keyFacts');
    expect(brief).toHaveProperty('mainAngle');
    expect(brief).toHaveProperty('tension');
    expect(brief).toHaveProperty('discussionHook');
    expect(brief).toHaveProperty('fanReactionPotential');
    expect(brief).toHaveProperty('contentRecommendation');
    expect(brief).toHaveProperty('storyConfidence');
    expect(brief).toHaveProperty('sourceSignals');
  });

  it('sets storyId when provided', () => {
    const brief = buildBrief(makePublishable(), undefined, 42);
    expect(brief.storyId).toBe(42);
  });

  it('storyId is undefined when not provided', () => {
    const brief = buildBrief(makePublishable());
    expect(brief.storyId).toBeUndefined();
  });
});

// ── Entity extraction ───────────────────────────────────────────────────

describe('buildBrief — entity', () => {
  it('joins team names for title_race', () => {
    const brief = buildBrief(makePublishable());
    expect(brief.entity).toContain('Arsenal');
    expect(brief.entity).toContain('Manchester City');
    expect(brief.entity).toContain('Liverpool');
  });

  it('uses fixture teams for critical_fixture', () => {
    const story = makePublishable({
      type: 'critical_fixture',
      payload: {
        fixture: { home: 'Arsenal', away: 'Chelsea', date: '2026-04-01', round: 'Matchday 30' },
        homeStanding: { rank: 1, points: 76, form: 'WWDWW' },
        awayStanding: { rank: 4, points: 60, form: 'LLLWW' },
        context: 'title/European',
        pointGap: 16,
      },
    });
    const brief = buildBrief(story);
    expect(brief.entity).toBe('Arsenal vs Chelsea');
  });

  it('uses single team for momentum', () => {
    const story = makePublishable({
      type: 'momentum',
      payload: { team: 'Wolves', form: 'LLLLL', rank: 13, points: 37, streakType: 'cold', lossesInLast5: 5 },
    });
    const brief = buildBrief(story);
    expect(brief.entity).toBe('Wolves');
  });
});

// ── Competition ─────────────────────────────────────────────────────────

describe('buildBrief — competition', () => {
  it('maps league_id 39 to Premier League', () => {
    const brief = buildBrief(makePublishable({ league_id: 39 }));
    expect(brief.competition).toBe('Premier League');
  });

  it('maps league_id 140 to La Liga', () => {
    const brief = buildBrief(makePublishable({ league_id: 140 }));
    expect(brief.competition).toBe('La Liga');
  });
});

// ── Key facts ───────────────────────────────────────────────────────────

describe('buildBrief — keyFacts', () => {
  it('extracts standings facts for title_race teams', () => {
    const brief = buildBrief(makePublishable());
    const factTexts = brief.keyFacts.map(f => f.fact);
    expect(factTexts.some(f => f.includes('Arsenal') && f.includes('76pts'))).toBe(true);
    expect(factTexts.some(f => f.includes('Manchester City') && f.includes('74pts'))).toBe(true);
  });

  it('includes gamesLeft fact', () => {
    const brief = buildBrief(makePublishable());
    expect(brief.keyFacts.some(f => f.fact.includes('6 games remaining'))).toBe(true);
  });

  it('includes pointGap fact', () => {
    const brief = buildBrief(makePublishable());
    expect(brief.keyFacts.some(f => f.fact.includes('4-point gap'))).toBe(true);
  });

  it('includes streak facts for momentum', () => {
    const story = makePublishable({
      type: 'momentum',
      payload: { team: 'Wolves', form: 'LLLLL', rank: 13, points: 37, streakType: 'cold', lossesInLast5: 5 },
    });
    const brief = buildBrief(story);
    expect(brief.keyFacts.some(f => f.fact.includes('losing streak'))).toBe(true);
    expect(brief.keyFacts.some(f => f.fact.includes('5 losses in last 5'))).toBe(true);
  });

  it('includes fixture facts for critical_fixture', () => {
    const story = makePublishable({
      type: 'critical_fixture',
      payload: {
        fixture: { home: 'Arsenal', away: 'Chelsea', date: '2026-04-01', round: 'Matchday 30' },
        homeStanding: { rank: 1, points: 76, form: 'WWDWW' },
        awayStanding: { rank: 4, points: 60, form: 'LLLWW' },
        context: 'title/European',
        pointGap: 16,
      },
    });
    const brief = buildBrief(story);
    expect(brief.keyFacts.some(f => f.source === 'fixture')).toBe(true);
  });

  it('tags facts with correct source', () => {
    const brief = buildBrief(makePublishable());
    for (const kf of brief.keyFacts) {
      expect(['standings', 'fixture', 'form', 'streak', 'gap']).toContain(kf.source);
    }
  });
});

// ── Narrative components ────────────────────────────────────────────────

describe('buildBrief — narrative', () => {
  it('whatHappened is non-empty for all story types', () => {
    for (const type of ['title_race', 'relegation', 'momentum', 'qualification', 'critical_fixture'] as const) {
      let payload: Record<string, unknown>;
      if (type === 'momentum') {
        payload = { team: 'Arsenal', form: 'WWWWW', rank: 1, points: 76, streakType: 'hot', winsInLast5: 5 };
      } else if (type === 'critical_fixture') {
        payload = {
          fixture: { home: 'Arsenal', away: 'Chelsea', date: '2026-04-01', round: 'MD30' },
          homeStanding: { rank: 1, points: 76, form: 'WWDWW' },
          awayStanding: { rank: 4, points: 60, form: 'LLLWW' },
          context: 'title/European',
          pointGap: 16,
        };
      } else if (type === 'qualification') {
        payload = {
          teams: [{ name: 'Tottenham', rank: 4, points: 58, form: 'DWLWL' }],
          cutoffPosition: 6,
          gapAtCutoff: 3,
          gamesLeft: 6,
        };
      } else {
        payload = makePublishable().payload;
      }
      const brief = buildBrief(makePublishable({ type, payload }));
      expect(brief.whatHappened.length).toBeGreaterThan(10);
    }
  });

  it('whyItMatters mentions stakes for late-season title_race', () => {
    const story = makePublishable({ payload: { ...makePublishable().payload as object, gamesLeft: 4 } });
    const brief = buildBrief(story);
    expect(brief.whyItMatters).toContain('decisive');
  });

  it('tension is non-empty', () => {
    const brief = buildBrief(makePublishable());
    expect(brief.tension.length).toBeGreaterThan(10);
  });

  it('discussionHook is a question or prompt', () => {
    const brief = buildBrief(makePublishable());
    expect(brief.discussionHook).toMatch(/\?/);
  });

  it('summary combines whatHappened and whyItMatters', () => {
    const brief = buildBrief(makePublishable());
    expect(brief.summary).toContain(brief.whatHappened);
    expect(brief.summary).toContain(brief.whyItMatters);
  });
});

// ── Content recommendation (editorial decision) ────────────────────────

describe('buildBrief — contentRecommendation', () => {
  it('returns short_post for moderate story without signals', () => {
    const brief = buildBrief(makePublishable({ narrativeStrength: 50, score: 60 }));
    expect(brief.contentRecommendation).toBe('short_post');
  });

  it('returns thread for high narrativeStrength', () => {
    const brief = buildBrief(makePublishable({ narrativeStrength: 70, score: 65 }));
    expect(brief.contentRecommendation).toBe('thread');
  });

  it('returns thread for rich signals (2+ distinct event types)', () => {
    const signals = {
      teamBuzz: new Map([
        ['arsenal', {
          team: 'arsenal',
          articleCount: 6,
          buzzScore: 15,
          headlines: ['Arsenal injury blow', 'Manager under fire'],
          signals: [
            { type: 'key_injury' as const, strength: 2 },
            { type: 'manager_pressure' as const, strength: 1 },
          ],
        }],
      ]),
      fetchedAt: Date.now(),
      sourcesOk: 3,
      sourcesTotal: 4,
    };
    const brief = buildBrief(makePublishable({ narrativeStrength: 40, score: 55 }), signals);
    expect(brief.contentRecommendation).toBe('thread');
  });

  it('returns thread for high total signal strength (>=3)', () => {
    const signals = {
      teamBuzz: new Map([
        ['arsenal', {
          team: 'arsenal',
          articleCount: 8,
          buzzScore: 18,
          headlines: ['Arsenal lose again', 'Arsenal crisis'],
          signals: [{ type: 'losing_streak' as const, strength: 3 }],
        }],
      ]),
      fetchedAt: Date.now(),
      sourcesOk: 3,
      sourcesTotal: 4,
    };
    const brief = buildBrief(makePublishable({ narrativeStrength: 40, score: 55 }), signals);
    expect(brief.contentRecommendation).toBe('thread');
  });

  it('returns thread for late-season high-stakes', () => {
    const brief = buildBrief(makePublishable({
      narrativeStrength: 50,
      score: 75,
      payload: { ...makePublishable().payload as object, gamesLeft: 4 },
    }));
    expect(brief.contentRecommendation).toBe('thread');
  });

  it('returns short_post for weak everything', () => {
    const brief = buildBrief(makePublishable({
      narrativeStrength: 30,
      score: 50,
      payload: { ...makePublishable().payload as object, gamesLeft: 15 },
    }));
    expect(brief.contentRecommendation).toBe('short_post');
  });
});

// ── Confidence ──────────────────────────────────────────────────────────

describe('buildBrief — storyConfidence', () => {
  it('returns high for high score + high narrative', () => {
    const brief = buildBrief(makePublishable({ score: 80, narrativeStrength: 65 }));
    expect(brief.storyConfidence).toBe('high');
  });

  it('returns medium for moderate score', () => {
    const brief = buildBrief(makePublishable({ score: 65, narrativeStrength: 40 }));
    expect(brief.storyConfidence).toBe('medium');
  });

  it('returns low for low score and narrative', () => {
    const brief = buildBrief(makePublishable({ score: 45, narrativeStrength: 30 }));
    expect(brief.storyConfidence).toBe('low');
  });
});

// ── Fan reaction potential ──────────────────────────────────────────────

describe('buildBrief — fanReactionPotential', () => {
  it('returns high for late-season title_race', () => {
    const story = makePublishable({
      payload: { ...makePublishable().payload as object, gamesLeft: 4 },
    });
    const brief = buildBrief(story);
    expect(brief.fanReactionPotential).toBe('high');
  });

  it('returns high for high narrativeStrength', () => {
    const brief = buildBrief(makePublishable({ narrativeStrength: 70 }));
    expect(brief.fanReactionPotential).toBe('high');
  });
});

// ── Source signals ──────────────────────────────────────────────────────

describe('buildBrief — sourceSignals', () => {
  it('returns empty when no newsSignals', () => {
    const brief = buildBrief(makePublishable());
    expect(brief.sourceSignals).toEqual([]);
  });

  it('includes signals for teams in the story', () => {
    const newsSignals = {
      teamBuzz: new Map([
        ['arsenal', {
          team: 'arsenal',
          articleCount: 5,
          buzzScore: 12,
          headlines: ['Arsenal win again', 'Arsenal transfer news'],
          signals: [{ type: 'winning_streak' as const, strength: 2 }],
        }],
      ]),
      fetchedAt: Date.now(),
      sourcesOk: 3,
      sourcesTotal: 4,
    };

    const brief = buildBrief(makePublishable(), newsSignals);
    expect(brief.sourceSignals).toHaveLength(1);
    expect(brief.sourceSignals[0].team).toBe('arsenal');
    expect(brief.sourceSignals[0].articleCount).toBe(5);
    expect(brief.sourceSignals[0].headlines).toHaveLength(2);
    expect(brief.sourceSignals[0].events).toContain('winning_streak (strength: 2)');
  });

  it('skips teams not in newsSignals', () => {
    const newsSignals = {
      teamBuzz: new Map([
        ['wolves', {
          team: 'wolves',
          articleCount: 2,
          buzzScore: 4,
          headlines: ['Wolves draw'],
          signals: [],
        }],
      ]),
      fetchedAt: Date.now(),
      sourcesOk: 3,
      sourcesTotal: 4,
    };

    const brief = buildBrief(makePublishable(), newsSignals);
    // Arsenal, Man City, Liverpool — none match wolves
    expect(brief.sourceSignals).toHaveLength(0);
  });
});

// ── Main angle varies by type ───────────────────────────────────────────

describe('buildBrief — mainAngle', () => {
  it('mentions form for title_race', () => {
    const brief = buildBrief(makePublishable());
    expect(brief.mainAngle).toMatch(/form/i);
  });

  it('mentions form for relegation', () => {
    const story = makePublishable({
      type: 'relegation',
      payload: {
        teams: [
          { name: 'Ipswich', rank: 18, points: 25, form: 'LLLLD' },
          { name: 'Southampton', rank: 19, points: 22, form: 'LLDLL' },
        ],
        cutoffRank: 17,
        gamesLeft: 6,
      },
    });
    const brief = buildBrief(story);
    expect(brief.mainAngle).toMatch(/form/i);
  });

  it('mentions six-pointer for critical_fixture', () => {
    const story = makePublishable({
      type: 'critical_fixture',
      payload: {
        fixture: { home: 'Arsenal', away: 'Chelsea', date: '2026-04-01', round: 'MD30' },
        homeStanding: { rank: 1, points: 76, form: 'WWDWW' },
        awayStanding: { rank: 4, points: 60, form: 'LLLWW' },
        context: 'title/European',
        pointGap: 16,
      },
    });
    const brief = buildBrief(story);
    expect(brief.mainAngle).toMatch(/six.pointer/i);
  });
});

// ── Signal-driven mainAngle ─────────────────────────────────────────────

function makeSignals(team: string, events: Array<{ type: string; strength: number }>, buzzScore = 10): ReturnType<typeof Object> {
  return {
    teamBuzz: new Map([
      [team.toLowerCase(), {
        team: team.toLowerCase(),
        articleCount: events.reduce((s, e) => s + e.strength, 0),
        buzzScore,
        headlines: ['Headline 1', 'Headline 2'],
        signals: events,
      }],
    ]),
    fetchedAt: Date.now(),
    sourcesOk: 3,
    sourcesTotal: 4,
  };
}

describe('buildBrief — signal-driven mainAngle', () => {
  it('overrides with instability angle for manager_change + losing_streak', () => {
    const signals = makeSignals('Arsenal', [
      { type: 'manager_change', strength: 2 },
      { type: 'losing_streak', strength: 1 },
    ]);
    const brief = buildBrief(makePublishable(), signals);
    expect(brief.mainAngle).toMatch(/freefall|lost control/i);
  });

  it('overrides with momentum angle for winning_streak (strength >= 2)', () => {
    const signals = makeSignals('Arsenal', [
      { type: 'winning_streak', strength: 2 },
    ]);
    const brief = buildBrief(makePublishable(), signals);
    expect(brief.mainAngle).toMatch(/momentum/i);
  });

  it('overrides with squad depth angle for key_injury (strength >= 2)', () => {
    const signals = makeSignals('Arsenal', [
      { type: 'key_injury', strength: 2 },
    ]);
    const brief = buildBrief(makePublishable(), signals);
    expect(brief.mainAngle).toMatch(/squad depth|key players/i);
  });

  it('overrides with manager spotlight for manager_pressure', () => {
    const signals = makeSignals('Arsenal', [
      { type: 'manager_pressure', strength: 2 },
    ]);
    const brief = buildBrief(makePublishable(), signals);
    expect(brief.mainAngle).toMatch(/spotlight|manager/i);
  });

  it('overrides with reset angle for manager_change alone (strong)', () => {
    const signals = makeSignals('Arsenal', [
      { type: 'manager_change', strength: 2 },
    ]);
    const brief = buildBrief(makePublishable(), signals);
    expect(brief.mainAngle).toMatch(/new manager|resets/i);
  });

  it('appends weak signal clause for single event with strength 1', () => {
    const signals = makeSignals('Arsenal', [
      { type: 'manager_change', strength: 1 },
    ]);
    const brief = buildBrief(makePublishable(), signals);
    // Should have type-based angle + appended clause
    expect(brief.mainAngle).toMatch(/form/i); // type-based angle preserved
    expect(brief.mainAngle).toMatch(/managerial change/i); // clause appended
  });

  it('falls back to type-based angle with no signals', () => {
    const brief = buildBrief(makePublishable());
    expect(brief.mainAngle).toMatch(/form/i);
    expect(brief.mainAngle).not.toMatch(/freefall|momentum|squad depth/i);
  });
});

// ── Signal-driven tension ───────────────────────────────────────────────

describe('buildBrief — signal-driven tension', () => {
  it('overrides with crisis tension for manager_change + losing_streak', () => {
    const signals = makeSignals('Arsenal', [
      { type: 'manager_change', strength: 2 },
      { type: 'losing_streak', strength: 1 },
    ]);
    const brief = buildBrief(makePublishable(), signals);
    expect(brief.tension).toMatch(/reset|damage/i);
  });

  it('overrides with fragility tension for winning_streak', () => {
    const signals = makeSignals('Arsenal', [
      { type: 'winning_streak', strength: 2 },
    ]);
    const brief = buildBrief(makePublishable(), signals);
    expect(brief.tension).toMatch(/fragile|found out/i);
  });

  it('overrides with squad tension for key_injury', () => {
    const signals = makeSignals('Arsenal', [
      { type: 'key_injury', strength: 2 },
    ]);
    const brief = buildBrief(makePublishable(), signals);
    expect(brief.tension).toMatch(/key players|individuals/i);
  });

  it('overrides with pressure tension for manager_pressure + losing_streak', () => {
    const signals = makeSignals('Arsenal', [
      { type: 'manager_pressure', strength: 1 },
      { type: 'losing_streak', strength: 1 },
    ]);
    const brief = buildBrief(makePublishable(), signals);
    expect(brief.tension).toMatch(/touchline|turbulence/i);
  });

  it('falls back to type-based tension with no signals', () => {
    const brief = buildBrief(makePublishable());
    // Type-based title_race tension
    expect(brief.tension).toMatch(/form|gap|weekend/i);
  });
});

// ── No invented data ────────────────────────────────────────────────────

describe('buildBrief — data integrity', () => {
  it('keyFacts only contain data from the payload', () => {
    const story = makePublishable({
      payload: {
        teams: [
          { name: 'Arsenal', rank: 1, points: 76, played: 32, form: 'WWDWW', goal_diff: 45 },
        ],
        pointGap: 2,
        gamesLeft: 6,
      },
    });
    const brief = buildBrief(story);
    for (const kf of brief.keyFacts) {
      // Every fact should reference something from the payload
      expect(kf.fact).toBeTruthy();
      // No percentage claims or invented stats
      expect(kf.fact).not.toMatch(/\d+%/);
    }
  });

  it('does not generate X copy in the brief', () => {
    const brief = buildBrief(makePublishable());
    // Brief should be analytical, not social-media-style
    // Check that no field contains hashtags
    const allText = JSON.stringify(brief);
    expect(allText).not.toMatch(/#\w{3,}/); // no hashtags
  });
});
