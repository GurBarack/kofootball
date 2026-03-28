import { config } from '../config.js';
import { getRecentStories } from '../storage/stories-repo.js';
import { logger } from '../utils/logger.js';
import type { ScoredStory } from '../detection/detector.js';
import type { StructuredContent, ContentMetadata, ContentPiece } from '../content/formatter.js';

// ── Score threshold ─────────────────────────────────────────────────────

export function passesScoreThreshold(story: ScoredStory): boolean {
  const min = config.minScoreThreshold;
  if (story.score < min) {
    logger.info({ type: story.type, score: story.score, min }, 'Below score threshold');
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

// TODO: Add similarity-based dedup — compare overlapping teams in payload,
// headline cosine similarity, and payload key intersection. This would catch
// cases like a title_race and qualification story about the same top-4 teams,
// or two momentum stories featuring clubs in the same relegation cluster.

// ── Content quality ─────────────────────────────────────────────────────

const MIN_MAIN_LENGTH = 60;
const MAX_MAIN_LENGTH = 600;

// ── Probability guard ───────────────────────────────────────────────
// Block explicit numerical probability claims when no probability data exists.
// Qualitative language ("chances are fading") is allowed — only quantitative
// claims that imply a calculation happened are blocked.

const PROBABILITY_PATTERNS = [
  /\d+\s*%/,           // "34%", "34 %"
  /\d+\s*percent/i,    // "34 percent"
  /\d+\s*pp\b/i,       // "12pp" (percentage points)
];

function hasProbabilityData(metadata?: ContentMetadata): boolean {
  if (!metadata?.probability) return false;
  const p = metadata.probability;
  return p.before != null || p.after != null || p.deltaPp != null;
}

export function passesContentQuality(
  content: StructuredContent,
  metadata?: ContentMetadata,
): { ok: boolean; reason?: string } {
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

  // Probability guard: block numerical claims without probability data
  if (!hasProbabilityData(metadata)) {
    const combined = `${content.main} ${content.data} ${content.edge || ''}`;
    for (const pattern of PROBABILITY_PATTERNS) {
      if (pattern.test(combined)) {
        return { ok: false, reason: 'Numerical probability claim without probability data' };
      }
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
    return { passed: false, reason: `Score ${story.score} below threshold ${config.minScoreThreshold}` };
  }
  if (isDuplicate(story)) {
    return { passed: false, reason: `Duplicate: ${story.type} for league ${story.league_id}` };
  }
  return { passed: true };
}

/** Post-generation filter: content quality */
export function postFilter(content: StructuredContent, metadata?: ContentMetadata): FilterResult {
  const quality = passesContentQuality(content, metadata);
  if (!quality.ok) {
    return { passed: false, reason: quality.reason };
  }
  return { passed: true };
}

// ── Thread quality gate ────────────────────────────────────────────────

const BANNED_PHRASES = ["it's all to play for", 'crunch time', 'must-win', 'scenes', 'massive'];

export function passesThreadQuality(
  tweets: ContentPiece[],
  metadata?: ContentMetadata,
): FilterResult {
  const { minTweets, maxTweets, maxTweetChars, openingMaxChars } = config.threads;

  if (tweets.length < minTweets) {
    return { passed: false, reason: `Too few tweets (${tweets.length}, min ${minTweets})` };
  }
  if (tweets.length > maxTweets) {
    return { passed: false, reason: `Too many tweets (${tweets.length}, max ${maxTweets})` };
  }

  // Opening tweet needs room for "1/N 🧵" prefix
  if (tweets[0].mainText.length > openingMaxChars) {
    return { passed: false, reason: `Opening tweet too long (${tweets[0].mainText.length} chars, max ${openingMaxChars})` };
  }

  for (let i = 0; i < tweets.length; i++) {
    const text = tweets[i].mainText;

    if (text.length < 20) {
      return { passed: false, reason: `Tweet ${i + 1} too short (${text.length} chars, min 20)` };
    }
    if (text.length > maxTweetChars) {
      return { passed: false, reason: `Tweet ${i + 1} too long (${text.length} chars, max ${maxTweetChars})` };
    }

    // Banned phrases
    const lower = text.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase)) {
        return { passed: false, reason: `Tweet ${i + 1} contains banned phrase: "${phrase}"` };
      }
    }

    // Probability guard (same as posts)
    if (!hasProbabilityData(metadata)) {
      for (const pattern of PROBABILITY_PATTERNS) {
        if (pattern.test(text)) {
          return { passed: false, reason: `Tweet ${i + 1}: numerical probability claim without data` };
        }
      }
    }
  }

  return { passed: true };
}
