import { config } from '../config.js';
import { getRecentStories } from '../storage/stories-repo.js';
import { logger } from '../utils/logger.js';
import type { ScoredStory } from '../detection/detector.js';
import type { StructuredContent } from '../content/formatter.js';

// ── Score threshold ─────────────────────────────────────────────────────

const MIN_SCORE = 35;

export function passesScoreThreshold(story: ScoredStory): boolean {
  if (story.score < MIN_SCORE) {
    logger.info({ type: story.type, score: story.score, min: MIN_SCORE }, 'Below score threshold');
    return false;
  }
  return true;
}

// ── Dedup ───────────────────────────────────────────────────────────────
// Reject if same type + league was published in the last N hours.

const DEDUP_HOURS = 8;

export function isDuplicate(story: ScoredStory): boolean {
  const recent = getRecentStories(DEDUP_HOURS);
  const dup = recent.some(
    r => r.type === story.type && r.league_id === story.league_id && r.status !== 'rejected',
  );
  if (dup) {
    logger.info({ type: story.type, league: story.league_id }, 'Duplicate story filtered');
  }
  return dup;
}

// ── Content quality ─────────────────────────────────────────────────────

const MIN_MAIN_LENGTH = 60;
const MAX_MAIN_LENGTH = 600;

export function passesContentQuality(content: StructuredContent): { ok: boolean; reason?: string } {
  if (!content.main || content.main.length < MIN_MAIN_LENGTH) {
    return { ok: false, reason: `MAIN too short (${content.main?.length || 0} chars, min ${MIN_MAIN_LENGTH})` };
  }
  if (content.main.length > MAX_MAIN_LENGTH) {
    return { ok: false, reason: `MAIN too long (${content.main.length} chars, max ${MAX_MAIN_LENGTH})` };
  }
  if (!content.data || content.data.length < 30) {
    return { ok: false, reason: 'DATA section missing or too short' };
  }

  // Banned phrases — clichés the prompt forbids
  const banned = ["it's all to play for", 'crunch time', 'must-win', 'scenes', 'massive'];
  const combined = `${content.main} ${content.data} ${content.edge || ''}`.toLowerCase();
  for (const phrase of banned) {
    if (combined.includes(phrase)) {
      return { ok: false, reason: `Contains banned phrase: "${phrase}"` };
    }
  }

  return { ok: true };
}

// ── Combined gate ───────────────────────────────────────────────────────

export interface FilterResult {
  passed: boolean;
  reason?: string;
}

/** Pre-generation filter: score + dedup */
export function preFilter(story: ScoredStory): FilterResult {
  if (!passesScoreThreshold(story)) {
    return { passed: false, reason: `Score ${story.score} below threshold ${MIN_SCORE}` };
  }
  if (isDuplicate(story)) {
    return { passed: false, reason: `Duplicate: ${story.type} for league ${story.league_id}` };
  }
  return { passed: true };
}

/** Post-generation filter: content quality */
export function postFilter(content: StructuredContent): FilterResult {
  const quality = passesContentQuality(content);
  if (!quality.ok) {
    return { passed: false, reason: quality.reason };
  }
  return { passed: true };
}
