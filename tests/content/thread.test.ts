import { describe, it, expect } from 'vitest';
import { parseThread } from '../../src/content/formatter.js';
import { passesThreadQuality } from '../../src/safety/filters.js';
import type { ContentPiece } from '../../src/content/formatter.js';

// ── parseThread ─────────────────────────────────────────────────────────

describe('parseThread', () => {
  it('parses a valid 4-tweet thread', () => {
    const raw = `TWEET 1:
Arsenal are two points clear with six games left.

TWEET 2:
The table: Arsenal 76pts, Man City 74pts. This is tight.

TWEET 3:
City's form is WLWDL. That's not title-winning form.

TWEET 4:
Arsenal smell blood. They might actually finish the job.`;

    const tweets = parseThread(raw);
    expect(tweets).toHaveLength(4);
    expect(tweets[0].mainText).toContain('Arsenal are two points clear');
    expect(tweets[3].mainText).toContain('finish the job');
  });

  it('handles varied TWEET label formats', () => {
    const raw = `TWEET  1:
First tweet here.

tweet 2:
Second tweet here.

TWEET 3:
Third tweet here.

TWEET 4:
Fourth tweet here.`;

    const tweets = parseThread(raw);
    expect(tweets).toHaveLength(4);
  });

  it('returns empty array for garbage input', () => {
    const tweets = parseThread('Just some random text without labels');
    // No TWEET markers → the whole text becomes one piece
    expect(tweets).toHaveLength(1);
  });

  it('returns empty for empty input', () => {
    const tweets = parseThread('');
    expect(tweets).toHaveLength(0);
  });

  it('collapses multiline tweets into single line', () => {
    const raw = `TWEET 1:
This is line one.
This is line two.

TWEET 2:
Single line tweet.

TWEET 3:
Another tweet.

TWEET 4:
Final tweet.`;

    const tweets = parseThread(raw);
    expect(tweets[0].mainText).toBe('This is line one. This is line two.');
  });

  it('all tweets have empty hashtags', () => {
    const raw = `TWEET 1:
First.

TWEET 2:
Second.

TWEET 3:
Third.

TWEET 4:
Fourth.`;

    const tweets = parseThread(raw);
    for (const t of tweets) {
      expect(t.hashtags).toEqual([]);
    }
  });
});

// ── passesThreadQuality ─────────────────────────────────────────────────

function makeTweets(count: number, charLength = 100): ContentPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    mainText: `Tweet ${i + 1}: ${'x'.repeat(charLength - 12)}`,
    hashtags: [],
  }));
}

describe('passesThreadQuality', () => {
  it('passes a valid 4-tweet thread', () => {
    const tweets = makeTweets(4);
    expect(passesThreadQuality(tweets).passed).toBe(true);
  });

  it('passes a valid 8-tweet thread', () => {
    const tweets = makeTweets(8);
    expect(passesThreadQuality(tweets).passed).toBe(true);
  });

  it('rejects too few tweets (3)', () => {
    const tweets = makeTweets(3);
    const result = passesThreadQuality(tweets);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Too few tweets');
  });

  it('rejects too many tweets (9)', () => {
    const tweets = makeTweets(9);
    const result = passesThreadQuality(tweets);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Too many tweets');
  });

  it('rejects tweet that is too short', () => {
    const tweets = makeTweets(4);
    tweets[2] = { mainText: 'Short.', hashtags: [] }; // 6 chars < 20
    const result = passesThreadQuality(tweets);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('too short');
  });

  it('rejects tweet that is too long (>280 chars)', () => {
    const tweets = makeTweets(4);
    tweets[1] = { mainText: 'x'.repeat(300), hashtags: [] };
    const result = passesThreadQuality(tweets);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('too long');
  });

  it('rejects opening tweet over 260 chars', () => {
    const tweets = makeTweets(4);
    tweets[0] = { mainText: 'x'.repeat(265), hashtags: [] };
    const result = passesThreadQuality(tweets);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('Opening tweet too long');
  });

  it('rejects banned phrase in any tweet', () => {
    const tweets = makeTweets(4);
    tweets[2] = { mainText: "This is a must-win game for both sides at the weekend.", hashtags: [] };
    const result = passesThreadQuality(tweets);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('banned phrase');
  });

  it('rejects probability claim without data', () => {
    const tweets = makeTweets(4);
    tweets[1] = { mainText: 'Arsenal now have a 78% chance of winning the title.', hashtags: [] };
    const result = passesThreadQuality(tweets);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('probability');
  });
});

// ── Thread eligibility (selector) ───────────────────────────────────────

import { hasRecentThread } from '../../src/selection/selector.js';
import type { StoryRow } from '../../src/storage/stories-repo.js';

function makeRow(overrides: Partial<StoryRow> = {}): StoryRow {
  return {
    id: 1,
    type: 'title_race',
    league_id: 39,
    headline: 'Test',
    score: 80,
    payload_json: '{}',
    content_variants: null,
    media_suggestion: 'text_only',
    status: 'pending',
    feedback: null,
    delivered_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('hasRecentThread', () => {
  it('returns false with no stories', () => {
    expect(hasRecentThread([])).toBe(false);
  });

  it('returns false when no story has thread contentMode', () => {
    const rows = [
      makeRow({ content_variants: JSON.stringify({ contentMode: 'short_post', posts: [] }) }),
    ];
    expect(hasRecentThread(rows)).toBe(false);
  });

  it('returns true when a recent story has thread contentMode', () => {
    const rows = [
      makeRow({ content_variants: JSON.stringify({ contentMode: 'thread', posts: [], thread: { tweets: [] } }) }),
    ];
    expect(hasRecentThread(rows)).toBe(true);
  });

  it('returns false when thread story is older than 24h', () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const rows = [
      makeRow({
        content_variants: JSON.stringify({ contentMode: 'thread' }),
        created_at: old,
      }),
    ];
    expect(hasRecentThread(rows)).toBe(false);
  });

  it('ignores old-format array content_variants', () => {
    const rows = [
      makeRow({ content_variants: JSON.stringify(['main text', 'data text', null]) }),
    ];
    expect(hasRecentThread(rows)).toBe(false);
  });

  it('handles null content_variants gracefully', () => {
    const rows = [makeRow({ content_variants: null })];
    expect(hasRecentThread(rows)).toBe(false);
  });
});
