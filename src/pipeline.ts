import { config } from './config.js';
import { logger } from './utils/logger.js';
import { fetchStandings, fetchRecentFixtures, fetchUpcomingFixtures, getRequestCount } from './fetcher/football-data.js';
import { saveStandings } from './storage/standings-repo.js';
import { saveFixtures } from './storage/fixtures-repo.js';
import { insertStory, updateStoryContent, getRecentStories } from './storage/stories-repo.js';
import { detectStories } from './detection/detector.js';
import { generateContent } from './content/generator.js';
import { generateHashtags } from './content/hashtags.js';
import { buildPostCandidates, formatForTelegram } from './content/post-builder.js';
import { sendStoryMessages } from './delivery/telegram.js';
import { preFilter, postFilter } from './safety/filters.js';
import { selectForPublishing } from './selection/selector.js';
import type { ScoredStory } from './detection/detector.js';
import type { PublishableStory } from './selection/selector.js';
import type { EnrichedContent } from './content/formatter.js';

export interface PipelineResult {
  fetched: number;
  detected: number;
  filtered: number;
  generated: number;
  delivered: number;
  errors: string[];
}

// ── Step 1: Fetch fresh data ────────────────────────────────────────────

async function fetchData(): Promise<number> {
  let fetched = 0;

  for (const leagueId of config.enabledLeagues) {
    try {
      const currentSeason = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;
      const standings = await fetchStandings(leagueId);
      if (standings.length > 0) {
        saveStandings(leagueId, currentSeason, standings);
        fetched++;
      }

      const recent = await fetchRecentFixtures(leagueId);
      if (recent.length > 0) saveFixtures(leagueId, recent);

      const upcoming = await fetchUpcomingFixtures(leagueId);
      if (upcoming.length > 0) saveFixtures(leagueId, upcoming);

      logger.info({ leagueId, standings: standings.length, recent: recent.length, upcoming: upcoming.length }, 'Data fetched');
    } catch (err) {
      logger.error({ leagueId, err }, 'Failed to fetch data for league');
    }
  }

  logger.info({ fetched, apiRequests: getRequestCount() }, 'Fetch step complete');
  return fetched;
}

// ── Step 2: Detect + filter ─────────────────────────────────────────────

function detectAndFilter(): ScoredStory[] {
  const detected = detectStories();
  logger.info({ count: detected.length }, 'Stories detected');

  const filtered = detected.filter(story => {
    const result = preFilter(story);
    if (!result.passed) {
      logger.info({ type: story.type, league: story.league_id, reason: result.reason }, 'Story filtered out');
    }
    return result.passed;
  });

  logger.info({ before: detected.length, after: filtered.length }, 'Pre-filter complete');
  return filtered;
}

// ── Step 3: Generate content ────────────────────────────────────────────

function buildDataSummary(story: ScoredStory): string {
  const payload = story.payload as Record<string, unknown>;
  const parts: string[] = [];

  const teams = payload.teams as Array<Record<string, unknown>> | undefined;
  if (teams) {
    parts.push(teams.map(t => `${t.name} ${t.points}pts`).join(' \u00B7 '));
  }

  if (payload.gamesLeft !== undefined) {
    let line = `${payload.gamesLeft} games left`;
    if (payload.pointGap !== undefined) line += ` \u00B7 ${payload.pointGap}pt gap`;
    parts.push(line);
  }

  return parts.join('\n');
}

async function generateForStory(
  story: PublishableStory,
): Promise<{ storyId: number; enriched: EnrichedContent } | null> {
  // Persist story shell first
  const storyId = insertStory({
    type: story.type,
    league_id: story.league_id,
    headline: story.headline,
    score: story.score,
    payload_json: JSON.stringify(story.payload),
  });

  try {
    const content = await generateContent(story);

    // Build metadata (probability fields empty for now — Feature C ready)
    const metadata = { hashtags: [] as string[] };

    // Post-generation quality check (includes probability guard)
    const quality = postFilter(content, metadata);
    if (!quality.passed) {
      logger.warn({ storyId, reason: quality.reason }, 'Content failed quality check');
      return null;
    }

    // Generate hashtags and build candidates
    const hashtags = generateHashtags(story);
    const candidates = buildPostCandidates(content, hashtags);

    const enriched: EnrichedContent = {
      contentMode: story.contentMode,
      posts: candidates,
      thread: null,
      raw: content,
      metadata: { hashtags },
    };

    // Persist enriched content
    updateStoryContent(storyId, enriched);

    return { storyId, enriched };
  } catch (err) {
    logger.error({ storyId, err }, 'Content generation failed');
    return null;
  }
}

// ── Step 4: Deliver to Telegram ─────────────────────────────────────────

async function deliver(
  story: PublishableStory,
  storyId: number,
  enriched: EnrichedContent,
): Promise<boolean> {
  const leagueName = config.leagues[story.league_id] || `League ${story.league_id}`;

  // Format candidates for X (presentation layer — computed, not stored)
  const formatted = formatForTelegram(enriched.posts);

  try {
    await sendStoryMessages({
      storyId,
      type: story.type,
      league: leagueName,
      headline: story.headline,
      score: story.score,
      candidates: formatted,
      dataSummary: buildDataSummary(story),
    });
    return true;
  } catch (err) {
    logger.error({ storyId, err }, 'Telegram delivery failed');
    return false;
  }
}

// ── Full pipeline ───────────────────────────────────────────────────────

export async function runPipeline(): Promise<PipelineResult> {
  const result: PipelineResult = {
    fetched: 0, detected: 0, filtered: 0, generated: 0, delivered: 0, errors: [],
  };

  logger.info('Pipeline started');
  const startTime = Date.now();

  // 1. Fetch
  try {
    result.fetched = await fetchData();
  } catch (err) {
    const msg = `Fetch step failed: ${err}`;
    logger.error(msg);
    result.errors.push(msg);
    return result;
  }

  // 2. Detect + filter
  const allFiltered = detectAndFilter();
  result.detected = allFiltered.length;

  // 2b. Select stories for publishing (editorial layer)
  const recentStories = getRecentStories(24);
  const stories = selectForPublishing(allFiltered, recentStories, config.maxStoriesPerRun);

  if (stories.length === 0) {
    logger.info('No stories selected for publishing. Pipeline done.');
    return result;
  }

  // 3. Generate + 4. Deliver — sequential per story to respect rate limits
  for (const story of stories) {
    const generated = await generateForStory(story);
    if (!generated) {
      result.filtered++;
      continue;
    }

    result.generated++;

    const sent = await deliver(story, generated.storyId, generated.enriched);
    if (sent) {
      result.delivered++;
    } else {
      result.errors.push(`Delivery failed for story ${generated.storyId}`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info({ ...result, durationSec: duration }, 'Pipeline complete');
  return result;
}
