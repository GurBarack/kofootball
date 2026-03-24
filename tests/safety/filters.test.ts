import { describe, it, expect } from 'vitest';
import { passesScoreThreshold, passesContentQuality } from '../../src/safety/filters.js';
import type { ScoredStory } from '../../src/detection/detector.js';
import type { StructuredContent } from '../../src/content/formatter.js';
import storySamples from '../fixtures/stories-sample.json';

function makeStory(overrides: Partial<ScoredStory> = {}): ScoredStory {
  return {
    type: 'title_race',
    league_id: 39,
    headline: 'test',
    payload: {},
    score: 60,
    ...overrides,
  };
}

function makeContent(overrides: Partial<StructuredContent> = {}): StructuredContent {
  return {
    main: 'Arsenal are two points clear with six games left. Liverpool are breathing down their neck after five straight wins. This race goes to the final day.',
    data: 'Arsenal 76pts, Man City 74pts, Liverpool 73pts — tightest 3-way race since 2014.',
    edge: 'City are done. Arsenal smell it.',
    ...overrides,
  };
}

describe('passesScoreThreshold', () => {
  it('passes for stories above threshold (default 50)', () => {
    const story = makeStory({ score: 75 });
    expect(passesScoreThreshold(story)).toBe(true);
  });

  it('passes for stories exactly at threshold', () => {
    const story = makeStory({ score: 50 });
    expect(passesScoreThreshold(story)).toBe(true);
  });

  it('rejects stories below threshold', () => {
    const story = makeStory({ score: 35 });
    expect(passesScoreThreshold(story)).toBe(false);
  });

  it('rejects zero-score stories', () => {
    const story = makeStory({ score: 0 });
    expect(passesScoreThreshold(story)).toBe(false);
  });
});

describe('passesContentQuality', () => {
  it('passes valid content with all sections', () => {
    const content = makeContent();
    const result = passesContentQuality(content);
    expect(result.ok).toBe(true);
  });

  it('rejects MAIN that is too short (<60 chars)', () => {
    const content = makeContent({ main: 'Too short.' });
    const result = passesContentQuality(content);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/MAIN too short/);
  });

  it('rejects MAIN that is too long (>600 chars)', () => {
    const content = makeContent({ main: 'A'.repeat(601) });
    const result = passesContentQuality(content);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/MAIN too long/);
  });

  it('rejects missing DATA section', () => {
    const content = makeContent({ data: '' });
    const result = passesContentQuality(content);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/DATA section missing/);
  });

  it('rejects DATA that is too short (<30 chars)', () => {
    const content = makeContent({ data: 'Short data.' });
    const result = passesContentQuality(content);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/DATA section missing or too short/);
  });

  it('rejects content with banned phrase "crunch time"', () => {
    const content = makeContent({
      main: 'This is crunch time for Arsenal. They need to keep winning to stay top of the league table.',
    });
    const result = passesContentQuality(content);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/banned phrase.*crunch time/);
  });

  it('rejects content with banned phrase "must-win"', () => {
    const content = makeContent({
      main: 'A must-win game for Liverpool at Anfield this weekend. They cannot afford to drop points now.',
    });
    const result = passesContentQuality(content);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/banned phrase.*must-win/);
  });

  it('rejects content with banned phrase in DATA section', () => {
    const content = makeContent({
      data: "It's all to play for in the bottom three. Any of them could go down.",
    });
    const result = passesContentQuality(content);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/banned phrase/);
  });

  it('allows content with null edge', () => {
    const content = makeContent({ edge: null });
    const result = passesContentQuality(content);
    expect(result.ok).toBe(true);
  });
});
