import { describe, it, expect } from 'vitest';
import { buildPostCandidates, formatForX } from '../../src/content/post-builder.js';
import type { StructuredContent } from '../../src/content/formatter.js';

const HASHTAGS = ['#PremierLeague', '#Arsenal', '#ManCity', '#TitleRace'];

const content: StructuredContent = {
  main: 'Arsenal are two points clear with six games left. Liverpool breathing down their neck.',
  data: 'Arsenal 76pts | Man City 74pts | Liverpool 73pts. Six games left. Tightest since 2014.',
  edge: 'City are done. Arsenal smell blood.',
};

describe('buildPostCandidates', () => {
  it('creates 3 candidates when edge exists', () => {
    const candidates = buildPostCandidates(content, HASHTAGS);
    expect(candidates).toHaveLength(3);
    expect(candidates.map(c => c.label)).toEqual(['main', 'data', 'edge']);
  });

  it('creates 2 candidates when edge is null', () => {
    const noEdge = { ...content, edge: null };
    const candidates = buildPostCandidates(noEdge, HASHTAGS);
    expect(candidates).toHaveLength(2);
    expect(candidates.map(c => c.label)).toEqual(['main', 'data']);
  });

  it('assigns hashtags to each candidate', () => {
    const candidates = buildPostCandidates(content, HASHTAGS);
    for (const c of candidates) {
      expect(c.hashtags).toEqual(HASHTAGS);
    }
  });

  it('preserves mainText from content sections', () => {
    const candidates = buildPostCandidates(content, HASHTAGS);
    expect(candidates[0].mainText).toBe(content.main);
    expect(candidates[1].mainText).toBe(content.data);
    expect(candidates[2].mainText).toBe(content.edge);
  });
});

describe('formatForX', () => {
  it('composes fullPostText with hashtags', () => {
    const candidates = buildPostCandidates(content, HASHTAGS);
    const formatted = formatForX(candidates);

    expect(formatted[0].fullPostText).toBe(
      `${content.main}\n\n${HASHTAGS.join(' ')}`,
    );
  });

  it('charCount matches fullPostText length', () => {
    const candidates = buildPostCandidates(content, HASHTAGS);
    const formatted = formatForX(candidates);

    for (const f of formatted) {
      expect(f.charCount).toBe(f.fullPostText.length);
    }
  });

  it('passes quality gate for short posts', () => {
    const candidates = buildPostCandidates(content, HASHTAGS);
    const formatted = formatForX(candidates);

    for (const f of formatted) {
      expect(f.passesQualityGate).toBe(true);
      expect(f.charCount).toBeLessThanOrEqual(270);
    }
  });

  it('trims hashtags when over 270 chars', () => {
    const longText = 'A'.repeat(230); // leaves ~40 chars for hashtags
    const longContent: StructuredContent = { main: longText, data: 'Short data.', edge: null };
    const manyTags = ['#PremierLeague', '#Arsenal', '#ManCity', '#TitleRace'];

    const candidates = buildPostCandidates(longContent, manyTags);
    const formatted = formatForX(candidates);

    const mainPost = formatted[0];
    expect(mainPost.charCount).toBeLessThanOrEqual(270);
    expect(mainPost.hashtags.length).toBeLessThan(manyTags.length);
    expect(mainPost.passesQualityGate).toBe(true);
  });

  it('sets passesQualityGate=false when body alone exceeds limit', () => {
    const hugeText = 'A'.repeat(280);
    const hugeContent: StructuredContent = { main: hugeText, data: 'Short.', edge: null };

    const candidates = buildPostCandidates(hugeContent, HASHTAGS);
    const formatted = formatForX(candidates);

    const mainPost = formatted[0];
    expect(mainPost.passesQualityGate).toBe(false);
    expect(mainPost.hashtags).toEqual([]); // all trimmed
  });

  it('handles empty hashtags', () => {
    const candidates = buildPostCandidates(content, []);
    const formatted = formatForX(candidates);

    expect(formatted[0].fullPostText).toBe(content.main);
    expect(formatted[0].hashtags).toEqual([]);
  });
});
