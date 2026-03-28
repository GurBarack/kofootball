import { describe, it, expect } from 'vitest';
import { matchTeams, matchEventSignals } from '../../src/news/sources.js';
import { extractSignals, computeBuzzBoost, computeSignalBoost } from '../../src/news/signals.js';
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

// ── matchEventSignals ────────────────────────────────────────────────────

describe('matchEventSignals', () => {
  it('detects manager_change from "sacked"', () => {
    expect(matchEventSignals('Tottenham boss sacked after poor run')).toContain('manager_change');
  });

  it('detects key_injury from "ruled out"', () => {
    expect(matchEventSignals('Star striker ruled out for 6 weeks')).toContain('key_injury');
  });

  it('detects losing_streak', () => {
    expect(matchEventSignals('Chelsea lost 4 in a row')).toContain('losing_streak');
  });

  it('detects winning_streak', () => {
    expect(matchEventSignals('Arsenal won 5 in a row')).toContain('winning_streak');
  });

  it('detects manager_pressure', () => {
    expect(matchEventSignals('Manager under pressure after defeat')).toContain('manager_pressure');
  });

  it('detects high_pressure_fixture', () => {
    expect(matchEventSignals('Crucial derby match this weekend')).toContain('high_pressure_fixture');
  });

  it('returns empty for neutral text', () => {
    expect(matchEventSignals('Premier League table update')).toEqual([]);
  });

  it('detects multiple events in one article', () => {
    const events = matchEventSignals('Manager sacked after injury crisis and 4th straight defeat');
    expect(events).toContain('manager_change');
    expect(events).toContain('key_injury');
  });
});

// ── extractSignals with events ───────────────────────────────────────────

describe('extractSignals — event signals', () => {
  it('attaches event signals to team buzz', () => {
    const items = [
      makeItem({ title: 'Tottenham boss sacked after poor results' }),
    ];
    const signals = extractSignals(items);
    const spurs = signals.teamBuzz.get('tottenham');
    expect(spurs).toBeDefined();
    expect(spurs!.signals).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'manager_change', strength: 1 })]),
    );
  });

  it('accumulates strength across multiple articles', () => {
    const items = [
      makeItem({ title: 'Chelsea injury blow for star striker' }),
      makeItem({ title: 'Chelsea ruled out of title race due to injuries' }),
      makeItem({ title: 'Third Chelsea player injured this week' }),
    ];
    const signals = extractSignals(items);
    const chelsea = signals.teamBuzz.get('chelsea');
    const injurySignal = chelsea!.signals.find(s => s.type === 'key_injury');
    expect(injurySignal!.strength).toBe(3);
  });

  it('keeps signals empty when no events detected', () => {
    const items = [makeItem({ title: 'Arsenal win 2-0' })];
    const signals = extractSignals(items);
    expect(signals.teamBuzz.get('arsenal')!.signals).toEqual([]);
  });
});

// ── computeSignalBoost ───────────────────────────────────────────────────

describe('computeSignalBoost', () => {
  it('returns 0 when no signals', () => {
    expect(computeSignalBoost(['arsenal'], undefined)).toEqual({
      boost: 0, topSignal: null, topTeam: null,
    });
  });

  it('returns +2 for strength 1', () => {
    const items = [makeItem({ title: 'Tottenham boss sacked' })];
    const signals = extractSignals(items);
    const { boost } = computeSignalBoost(['tottenham'], signals);
    expect(boost).toBe(2);
  });

  it('returns +4 for strength 2', () => {
    const items = [
      makeItem({ title: 'Tottenham manager sacked' }),
      makeItem({ title: 'Tottenham fired their coach' }),
    ];
    const signals = extractSignals(items);
    const { boost } = computeSignalBoost(['tottenham'], signals);
    expect(boost).toBe(4);
  });

  it('returns +7 for strength 3+', () => {
    const items = [
      makeItem({ title: 'Chelsea injury crisis deepens' }),
      makeItem({ title: 'Chelsea star ruled out' }),
      makeItem({ title: 'Third Chelsea player injured' }),
    ];
    const signals = extractSignals(items);
    const { boost, topSignal } = computeSignalBoost(['chelsea'], signals);
    expect(boost).toBe(7);
    expect(topSignal).toBe('key_injury');
  });

  it('caps boost at signalBoostMax', () => {
    // Even with very high strength, should not exceed cap
    const items = Array.from({ length: 10 }, (_, i) =>
      makeItem({ title: `Chelsea injury news ${i}`, url: `https://example.com/c-${i}` }),
    );
    const signals = extractSignals(items);
    const { boost } = computeSignalBoost(['chelsea'], signals);
    expect(boost).toBeLessThanOrEqual(10);
  });

  it('picks highest signal across teams', () => {
    const items = [
      makeItem({ title: 'Arsenal win again' }), // no event
      makeItem({ title: 'Chelsea boss sacked' }),
      makeItem({ title: 'Chelsea manager fired' }),
      makeItem({ title: 'Chelsea new head coach appointed' }),
    ];
    const signals = extractSignals(items);
    const { boost, topTeam, topSignal } = computeSignalBoost(['arsenal', 'chelsea'], signals);
    expect(topTeam).toBe('chelsea');
    expect(topSignal).toBe('manager_change');
    expect(boost).toBe(7); // strength 3 → 7
  });
});
