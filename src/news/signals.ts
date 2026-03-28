import { config } from '../config.js';
import { matchTeams, matchEventSignals } from './sources.js';
import type { EventType } from './sources.js';
import type { NewsItem } from './fetch-sources.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface EventSignal {
  type: EventType;
  strength: number;  // count of articles with this event
}

export interface TeamBuzz {
  team: string;
  articleCount: number;
  buzzScore: number;
  headlines: string[];
  signals: EventSignal[];
}

export interface NewsSignals {
  teamBuzz: Map<string, TeamBuzz>;
  fetchedAt: number;
  sourcesOk: number;
  sourcesTotal: number;
}

// ── Signal extraction ────────────────────────────────────────────────────

function recencyPoints(publishedAt: string | undefined): number {
  if (!publishedAt) return 1; // unknown age → minimum points
  const hoursAgo = (Date.now() - new Date(publishedAt).getTime()) / (1000 * 60 * 60);
  if (hoursAgo <= 2) return 3;
  if (hoursAgo <= 6) return 2;
  return 1;
}

export function extractSignals(
  items: NewsItem[],
  sourcesOk = 0,
  sourcesTotal = 0,
): NewsSignals {
  const buzzMap = new Map<string, TeamBuzz>();
  const cap = config.news.buzzScoreCap;

  for (const item of items) {
    const titleTeams = matchTeams(item.title);
    const descTeams = item.description ? matchTeams(item.description) : [];

    // Merge: title matches get full points, description-only get half
    const points = recencyPoints(item.publishedAt);
    const scored = new Map<string, number>();

    for (const team of titleTeams) {
      scored.set(team, points);
    }
    for (const team of descTeams) {
      if (!scored.has(team)) {
        scored.set(team, Math.ceil(points / 2));
      }
    }

    // Detect event signals from title + description
    const fullText = item.title + (item.description ? ' ' + item.description : '');
    const events = matchEventSignals(fullText);

    for (const [team, pts] of scored) {
      let buzz = buzzMap.get(team);
      if (!buzz) {
        buzz = { team, articleCount: 0, buzzScore: 0, headlines: [], signals: [] };
        buzzMap.set(team, buzz);
      }
      buzz.articleCount++;
      buzz.buzzScore = Math.min(cap, buzz.buzzScore + pts);
      if (buzz.headlines.length < 3) {
        buzz.headlines.push(item.title);
      }

      // Accumulate event signals
      for (const eventType of events) {
        const existing = buzz.signals.find(s => s.type === eventType);
        if (existing) {
          existing.strength++;
        } else {
          buzz.signals.push({ type: eventType, strength: 1 });
        }
      }
    }
  }

  return {
    teamBuzz: buzzMap,
    fetchedAt: Date.now(),
    sourcesOk,
    sourcesTotal,
  };
}

// ── Buzz boost for selector ──────────────────────────────────────────────

/**
 * Compute the buzz boost for a set of team names.
 * Returns { boost, topTeam } where boost is 0–buzzBoostMax.
 */
export function computeBuzzBoost(
  teamNames: string[],
  signals: NewsSignals | undefined,
): { boost: number; topTeam: string | null } {
  if (!signals || signals.teamBuzz.size === 0) {
    return { boost: 0, topTeam: null };
  }

  let maxBuzz = 0;
  let topTeam: string | null = null;

  for (const name of teamNames) {
    const buzz = signals.teamBuzz.get(name);
    if (buzz && buzz.buzzScore > maxBuzz) {
      maxBuzz = buzz.buzzScore;
      topTeam = name;
    }
  }

  const boost = Math.min(
    config.news.buzzBoostMax,
    Math.round(maxBuzz * (config.news.buzzBoostMax / config.news.buzzScoreCap)),
  );

  return { boost, topTeam };
}

// ── Event signal boost for selector ──────────────────────────────────────

const SIGNAL_STRENGTH_BONUS: Record<number, number> = {
  1: 2,
  2: 4,
  3: 7,
};

function strengthToBonus(strength: number): number {
  if (strength >= 3) return 7;
  return SIGNAL_STRENGTH_BONUS[strength] ?? 0;
}

/**
 * Compute event signal boost for a set of team names.
 * Takes the highest single-signal bonus across all teams, capped at signalBoostMax.
 */
export function computeSignalBoost(
  teamNames: string[],
  signals: NewsSignals | undefined,
): { boost: number; topSignal: EventType | null; topTeam: string | null } {
  if (!signals || signals.teamBuzz.size === 0) {
    return { boost: 0, topSignal: null, topTeam: null };
  }

  let maxBonus = 0;
  let topSignal: EventType | null = null;
  let topTeam: string | null = null;

  for (const name of teamNames) {
    const buzz = signals.teamBuzz.get(name);
    if (!buzz) continue;

    for (const sig of buzz.signals) {
      const bonus = strengthToBonus(sig.strength);
      if (bonus > maxBonus) {
        maxBonus = bonus;
        topSignal = sig.type;
        topTeam = name;
      }
    }
  }

  const boost = Math.min(config.news.signalBoostMax, maxBonus);
  return { boost, topSignal, topTeam };
}
