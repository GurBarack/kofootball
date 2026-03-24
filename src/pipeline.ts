import { config } from './config.js';
import { logger } from './utils/logger.js';
import { fetchStandings, fetchRecentFixtures, fetchUpcomingFixtures, getRequestCount } from './fetcher/api-football.js';
import { saveStandings } from './storage/standings-repo.js';
import { saveFixtures } from './storage/fixtures-repo.js';
import { insertStory, updateStoryContent } from './storage/stories-repo.js';
import { detectStories } from './detection/detector.js';
import { generateContent } from './content/generator.js';
import { formatForTelegramHtml, type StructuredContent } from './content/formatter.js';
import { sendStoryPreview } from './delivery/telegram.js';
import { preFilter, postFilter } from './safety/filters.js';
import type { ScoredStory } from './detection/detector.js';

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
      const standings = await fetchStandings(leagueId, config.season);
      if (standings.length > 0) {
        saveStandings(leagueId, config.season, standings);
        fetched++;
      }

      const recent = await fetchRecentFixtures(leagueId, config.season);
      if (recent.length > 0) saveFixtures(leagueId, recent);

      const upcoming = await fetchUpcomingFixtures(leagueId, config.season);
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

async function generateForStory(
  story: ScoredStory,
): Promise<{ storyId: number; content: StructuredContent } | null> {
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

    // Post-generation quality check
    const quality = postFilter(content);
    if (!quality.passed) {
      logger.warn({ storyId, reason: quality.reason }, 'Content failed quality check');
      return null;
    }

    // Persist content
    const variants = [content.main, content.data, content.edge].filter(Boolean) as string[];
    updateStoryContent(storyId, variants);

    return { storyId, content };
  } catch (err) {
    logger.error({ storyId, err }, 'Content generation failed');
    return null;
  }
}

// ── Step 4: Deliver to Telegram ─────────────────────────────────────────

async function deliver(
  story: ScoredStory,
  storyId: number,
  content: StructuredContent,
): Promise<boolean> {
  const leagueName = config.leagues[story.league_id] || `League ${story.league_id}`;
  const variants = [content.main, content.data, content.edge].filter(Boolean) as string[];

  try {
    await sendStoryPreview({
      id: storyId,
      type: story.type,
      league: leagueName,
      headline: story.headline,
      score: story.score,
      variants,
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

  // Cap to maxStoriesPerRun — only the top-scoring stories get delivered
  const stories = allFiltered.slice(0, config.maxStoriesPerRun);
  if (allFiltered.length > stories.length) {
    logger.info(
      { total: allFiltered.length, delivering: stories.length, cap: config.maxStoriesPerRun },
      'Capped stories to maxStoriesPerRun',
    );
  }

  if (stories.length === 0) {
    logger.info('No stories passed filters. Pipeline done.');
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

    const sent = await deliver(story, generated.storyId, generated.content);
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
