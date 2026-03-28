import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { computeBuzzBoost, computeSignalBoost } from '../news/signals.js';
import type { ScoredStory } from '../detection/detector.js';
import type { StoryRow } from '../storage/stories-repo.js';
import type { ContentMode } from '../content/formatter.js';
import type { NewsSignals } from '../news/signals.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface PublishableStory extends ScoredStory {
  contentMode: ContentMode;
  narrativeStrength: number;
  compositeRank: number;
  is_thread_candidate: boolean;
}

// ── Team extraction ──────────────────────────────────────────────────────

export function extractTeamNames(story: ScoredStory): string[] {
  const p = story.payload as Record<string, unknown>;

  // title_race, relegation, qualification — teams array
  const teams = p.teams as Array<{ name: string }> | undefined;
  if (teams && teams.length > 0) {
    return teams.map(t => t.name.toLowerCase());
  }

  // critical_fixture — fixture.home / fixture.away
  const fixture = p.fixture as { home?: string; away?: string } | undefined;
  if (fixture) {
    const names: string[] = [];
    if (fixture.home) names.push(fixture.home.toLowerCase());
    if (fixture.away) names.push(fixture.away.toLowerCase());
    return names;
  }

  // momentum — single team string
  const team = p.team as string | undefined;
  if (team) {
    return [team.toLowerCase()];
  }

  return [];
}

export function extractTeamNamesFromRow(row: StoryRow): string[] {
  try {
    const payload = JSON.parse(row.payload_json);
    return extractTeamNames({ ...row, payload, score: row.score } as ScoredStory);
  } catch {
    return [];
  }
}

// ── Overlap ──────────────────────────────────────────────────────────────

export function teamOverlapRatio(teamsA: string[], teamsB: string[]): number {
  if (teamsA.length === 0 || teamsB.length === 0) return 0;
  const setA = new Set(teamsA);
  const setB = new Set(teamsB);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  return intersection / Math.min(setA.size, setB.size);
}

// ── Narrative strength components ────────────────────────────────────────

const TYPE_WEIGHTS: Record<string, number> = {
  title_race: 15,
  relegation: 13,
  critical_fixture: 12,
  qualification: 8,
  momentum: 6,
};

/** Convert form string "WWDLW" to numeric score (W=+1, D=0, L=-1) */
function formToScore(form: string): number {
  let s = 0;
  for (const c of form) {
    if (c === 'W') s += 1;
    else if (c === 'L') s -= 1;
  }
  return s;
}

/** Situation Pressure (0-35): gamesLeft + pointGap urgency */
export function scoreSituationPressure(story: ScoredStory): number {
  const p = story.payload as Record<string, unknown>;
  let pts = 0;

  const gamesLeft = (p.gamesLeft as number) ?? null;
  if (gamesLeft !== null) {
    if (gamesLeft <= 3) pts += 20;
    else if (gamesLeft <= 5) pts += 15;
    else if (gamesLeft <= 8) pts += 10;
  }

  const gap = (p.pointGap as number) ?? (p.gapAtCutoff as number) ?? null;
  if (gap !== null) {
    if (gap <= 1) pts += 15;
    else if (gap <= 3) pts += 10;
    else if (gap <= 5) pts += 5;
  }

  // momentum: no gamesLeft or pointGap — use rank-based bonus
  if (story.type === 'momentum' && gamesLeft === null && gap === null) {
    const rank = (p.rank as number) ?? 10;
    const streakType = p.streakType as string;
    pts = 10; // base for momentum
    if (streakType === 'cold' && rank <= 6) pts += 10;
    if (streakType === 'hot' && rank >= 15) pts += 10;
  }

  return Math.min(35, pts);
}

/** Form Contrast (0-30): teams moving in opposite directions */
export function scoreFormContrast(story: ScoredStory): number {
  const p = story.payload as Record<string, unknown>;

  // momentum: streak intensity
  if (story.type === 'momentum') {
    const wins = (p.winsInLast5 as number) ?? 0;
    const losses = (p.lossesInLast5 as number) ?? 0;
    const rank = (p.rank as number) ?? 10;
    let pts = 10;
    if (wins === 5 || losses === 5) pts = 25;
    else if (wins >= 4 || losses >= 4) pts = 18;
    // rank-based bonus for unexpected streaks
    if ((p.streakType === 'cold' && rank <= 6) || (p.streakType === 'hot' && rank >= 15)) {
      pts += 8;
    }
    return Math.min(30, pts);
  }

  // critical_fixture: compare home vs away form
  if (story.type === 'critical_fixture') {
    const homeForm = ((p.homeStanding as Record<string, unknown>)?.form as string) ?? '';
    const awayForm = ((p.awayStanding as Record<string, unknown>)?.form as string) ?? '';
    if (!homeForm && !awayForm) return 10;
    const diff = Math.abs(formToScore(homeForm) - formToScore(awayForm));
    if (diff >= 6) return 30;
    if (diff >= 4) return 24;
    if (diff >= 3) return 18;
    if (diff >= 2) return 14;
    return 8;
  }

  // title_race, relegation, qualification: compare best vs worst form among teams
  const teams = p.teams as Array<{ form?: string | null }> | undefined;
  if (!teams || teams.length < 2) return 10;

  const scores = teams.map(t => formToScore(t.form ?? ''));
  const divergence = Math.max(...scores) - Math.min(...scores);
  if (divergence >= 4) return 30;
  if (divergence >= 3) return 24;
  if (divergence >= 2) return 18;
  if (divergence >= 1) return 12;
  return 5;
}

/** Freshness Penalty (0 to -20): recent similar stories reduce strength */
export function scoreFreshnessPenalty(story: ScoredStory, recentStories: StoryRow[]): number {
  const storyTeams = extractTeamNames(story);
  if (storyTeams.length === 0) return 0;

  let worstPenalty = 0;

  for (const recent of recentStories) {
    const recentTeams = extractTeamNamesFromRow(recent);
    const overlap = teamOverlapRatio(storyTeams, recentTeams);
    if (overlap < 0.3) continue;

    const hoursAgo = (Date.now() - new Date(recent.created_at).getTime()) / (1000 * 60 * 60);

    let penalty = 0;
    if (overlap >= 0.8) {
      penalty = hoursAgo <= 6 ? -20 : hoursAgo <= 12 ? -15 : -8;
    } else if (overlap >= 0.5) {
      penalty = hoursAgo <= 6 ? -12 : hoursAgo <= 12 ? -8 : -4;
    } else {
      penalty = hoursAgo <= 6 ? -6 : -3;
    }

    worstPenalty = Math.min(worstPenalty, penalty);
  }

  return worstPenalty;
}

// ── Composite scoring ────────────────────────────────────────────────────

export function computeNarrativeStrength(story: ScoredStory, recentStories: StoryRow[]): number {
  const pressure = scoreSituationPressure(story);
  const contrast = scoreFormContrast(story);
  const typeWeight = TYPE_WEIGHTS[story.type] ?? 5;
  const freshness = scoreFreshnessPenalty(story, recentStories);

  const raw = pressure + contrast + typeWeight + freshness;
  return Math.min(100, Math.max(0, raw));
}

// ── Main selector ────────────────────────────────────────────────────────

export function selectForPublishing(
  candidates: ScoredStory[],
  recentStories: StoryRow[],
  maxStories: number,
  newsSignals?: NewsSignals,
): PublishableStory[] {
  const { teamCooldownHours, teamCooldownPenalty, narrativeCooldownHours, narrativeOverlapThreshold } = config.selection;

  // 1. Score each candidate
  const scored = candidates.map(story => {
    const narrativeStrength = computeNarrativeStrength(story, recentStories);
    let compositeRank = config.selection.compositeWeightScore * story.score
      + config.selection.compositeWeightNarrative * narrativeStrength;

    const penalties: string[] = [];
    const storyTeams = extractTeamNames(story);

    // 1b. News buzz boost (additive, 0-15)
    const { boost: buzzBoost, topTeam: buzzTeam } = computeBuzzBoost(storyTeams, newsSignals);
    compositeRank += buzzBoost;

    // 1c. Event signal boost (additive, 0-10)
    const { boost: signalBoost, topSignal, topTeam: signalTeam } = computeSignalBoost(storyTeams, newsSignals);
    compositeRank += signalBoost;

    // 2. Team cooldown (soft): penalize if primary teams appeared recently
    const cooldownCutoff = Date.now() - teamCooldownHours * 60 * 60 * 1000;

    for (const recent of recentStories) {
      const recentTime = new Date(recent.created_at).getTime();
      if (recentTime < cooldownCutoff) continue;

      const recentTeams = extractTeamNamesFromRow(recent);
      if (teamOverlapRatio(storyTeams, recentTeams) > narrativeOverlapThreshold) {
        compositeRank -= teamCooldownPenalty;
        penalties.push(`team_cooldown:-${teamCooldownPenalty} (overlap with story #${recent.id})`);
        break; // apply once
      }
    }

    const result: PublishableStory = {
      ...story,
      narrativeStrength,
      compositeRank,
      contentMode: 'short_post' as ContentMode,
      is_thread_candidate: false,
    };

    logger.info({
      type: story.type,
      league: story.league_id,
      headline: story.headline,
      score: story.score,
      narrativeStrength,
      newsBuzz: buzzBoost,
      buzzTeam,
      newsSignal: signalBoost,
      topSignal,
      signalTeam,
      penalties: penalties.length > 0 ? penalties : 'none',
      compositeRank: Math.round(compositeRank * 10) / 10,
      teams: storyTeams,
    }, 'Selector: scored candidate');

    return result;
  });

  // 3. Sort by compositeRank descending
  scored.sort((a, b) => b.compositeRank - a.compositeRank);

  // 4. Narrative dedup: skip stories with >50% team overlap with already-selected
  //    or recently created stories
  const narrativeCutoff = Date.now() - narrativeCooldownHours * 60 * 60 * 1000;
  const recentTeamSets: string[][] = recentStories
    .filter(r => new Date(r.created_at).getTime() >= narrativeCutoff)
    .map(r => extractTeamNamesFromRow(r));

  const selected: PublishableStory[] = [];
  const selectedTeamSets: string[][] = [];

  for (const story of scored) {
    const teams = extractTeamNames(story);

    // Check overlap with already-selected stories in this batch
    const batchOverlap = selectedTeamSets.some(
      used => teamOverlapRatio(teams, used) > narrativeOverlapThreshold,
    );
    if (batchOverlap) {
      logger.info({
        type: story.type,
        headline: story.headline,
        compositeRank: Math.round(story.compositeRank * 10) / 10,
        reason: 'narrative_dedup_batch',
      }, 'Selector: skipped (overlaps with selected story)');
      continue;
    }

    // Check overlap with recently created stories
    const recentOverlap = recentTeamSets.some(
      used => teamOverlapRatio(teams, used) > narrativeOverlapThreshold,
    );
    if (recentOverlap) {
      logger.info({
        type: story.type,
        headline: story.headline,
        compositeRank: Math.round(story.compositeRank * 10) / 10,
        reason: 'narrative_dedup_recent',
      }, 'Selector: skipped (overlaps with recent story)');
      continue;
    }

    selected.push(story);
    selectedTeamSets.push(teams);

    logger.info({
      type: story.type,
      headline: story.headline,
      compositeRank: Math.round(story.compositeRank * 10) / 10,
    }, 'Selector: SELECTED');

    if (selected.length >= maxStories) break;
  }

  logger.info({
    candidates: candidates.length,
    selected: selected.length,
    maxStories,
  }, 'Selection complete');

  return selected;
}
