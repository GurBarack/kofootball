import { config } from '../config.js';
import { matchTeams } from './sources.js';
import type { NewsItem } from './fetch-sources.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface TeamBuzz {
  team: string;
  articleCount: number;
  buzzScore: number;
  headlines: string[];
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

    for (const [team, pts] of scored) {
      let buzz = buzzMap.get(team);
      if (!buzz) {
        buzz = { team, articleCount: 0, buzzScore: 0, headlines: [] };
        buzzMap.set(team, buzz);
      }
      buzz.articleCount++;
      buzz.buzzScore = Math.min(cap, buzz.buzzScore + pts);
      if (buzz.headlines.length < 3) {
        buzz.headlines.push(item.title);
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
