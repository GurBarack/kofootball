import { describe, it, expect } from 'vitest';
import { matchTeams } from '../../src/news/sources.js';
import { extractSignals, computeBuzzBoost } from '../../src/news/signals.js';
import type { NewsItem } from '../../src/news/fetch-sources.js';

// ── matchTeams ───────────────────────────────────────────────────────────

describe('matchTeams', () => {
  it('matches multiple teams in a headline', () => {
    expect(matchTeams('Arsenal beat Chelsea 3-0 at the Emirates')).toEqual(
      expect.arrayContaining(['arsenal', 'chelsea']),
    );
  });

  it('matches aliases like Barca and Real Madrid', () => {
    const teams = matchTeams('Barca cruise past Real Madrid in El Clasico');
    expect(teams).toContain('barcelona');
    expect(teams).toContain('real madrid');
  });

  it('is case insensitive', () => {
    expect(matchTeams('ARSENAL thrash LIVERPOOL')).toEqual(
      expect.arrayContaining(['arsenal', 'liverpool']),
    );
  });

  it('returns empty for non-football text', () => {
    expect(matchTeams('Weather forecast for London this weekend')).toEqual([]);
  });

  it('returns no duplicates', () => {
    const teams = matchTeams('Arsenal Arsenal Arsenal');
    expect(teams.filter(t => t === 'arsenal')).toHaveLength(1);
  });
});

// ── extractSignals ───────────────────────────────────────────────────────

function makeItem(overrides: Partial<NewsItem> = {}): NewsItem {
  return {
    source: 'BBC Sport',
    title: 'Arsenal latest news',
    url: `https://example.com/${Math.random()}`,
    publishedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('extractSignals', () => {
  it('counts articles per team', () => {
    const items = [
      makeItem({ title: 'Arsenal win again' }),
      makeItem({ title: 'Arsenal transfer rumours' }),
      makeItem({ title: 'Chelsea draw at home' }),
    ];
    const signals = extractSignals(items);
    expect(signals.teamBuzz.get('arsenal')?.articleCount).toBe(2);
    expect(signals.teamBuzz.get('chelsea')?.articleCount).toBe(1);
  });

  it('weights recent articles higher', () => {
    const recentItem = makeItem({
      title: 'Arsenal score late winner',
      publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1h ago
    });
    const oldItem = makeItem({
      title: 'Liverpool draw with Everton',
      publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(), // 10h ago
    });
    const signals = extractSignals([recentItem, oldItem]);
    expect(signals.teamBuzz.get('arsenal')!.buzzScore).toBeGreaterThan(
      signals.teamBuzz.get('liverpool')!.buzzScore,
    );
  });

  it('caps buzzScore at configured max', () => {
    // Create many articles to exceed cap
    const items = Array.from({ length: 20 }, (_, i) =>
      makeItem({
        title: `Arsenal news ${i}`,
        url: `https://example.com/arsenal-${i}`,
        publishedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30min ago
      }),
    );
    const signals = extractSignals(items);
    expect(signals.teamBuzz.get('arsenal')!.buzzScore).toBeLessThanOrEqual(20);
  });

  it('stores top 3 headlines', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      makeItem({
        title: `Arsenal headline ${i}`,
        url: `https://example.com/h-${i}`,
      }),
    );
    const signals = extractSignals(items);
    expect(signals.teamBuzz.get('arsenal')!.headlines).toHaveLength(3);
  });

  it('returns empty signals for empty input', () => {
    const signals = extractSignals([]);
    expect(signals.teamBuzz.size).toBe(0);
  });

  it('gives half points for description-only matches', () => {
    const titleMatch = makeItem({
      title: 'Arsenal win the derby',
      publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    });
    const descOnlyMatch = makeItem({
      title: 'Premier League roundup',
      description: 'Chelsea dominated the second half',
      publishedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    });
    const signals = extractSignals([titleMatch, descOnlyMatch]);
    // Arsenal gets full 3pts (title, <2h), Chelsea gets ceil(3/2)=2pts (desc only)
    expect(signals.teamBuzz.get('arsenal')!.buzzScore).toBeGreaterThan(
      signals.teamBuzz.get('chelsea')!.buzzScore,
    );
  });
});

// ── computeBuzzBoost ─────────────────────────────────────────────────────

describe('computeBuzzBoost', () => {
  it('returns 0 when no signals', () => {
    expect(computeBuzzBoost(['arsenal'], undefined)).toEqual({ boost: 0, topTeam: null });
  });

  it('returns boost based on highest buzz team', () => {
    const signals = extractSignals([
      makeItem({ title: 'Arsenal win' }),
      makeItem({ title: 'Arsenal transfer' }),
      makeItem({ title: 'Arsenal sign player' }),
      makeItem({ title: 'Chelsea lose' }),
    ]);
    const { boost, topTeam } = computeBuzzBoost(['arsenal', 'chelsea'], signals);
    expect(topTeam).toBe('arsenal');
    expect(boost).toBeGreaterThan(0);
  });

  it('returns 0 for teams with no buzz', () => {
    const signals = extractSignals([makeItem({ title: 'Arsenal win' })]);
    expect(computeBuzzBoost(['wolves'], signals).boost).toBe(0);
  });

  it('caps boost at buzzBoostMax', () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      makeItem({ title: `Arsenal ${i}`, url: `https://example.com/a-${i}` }),
    );
    const signals = extractSignals(items);
    const { boost } = computeBuzzBoost(['arsenal'], signals);
    expect(boost).toBeLessThanOrEqual(15);
  });
});
