import { config } from '../config.js';
import { getLatestStandings } from '../storage/standings-repo.js';
import { getUpcomingFixtures } from '../storage/fixtures-repo.js';
import { getLastStoryForLeague } from '../storage/stories-repo.js';
import { logger } from '../utils/logger.js';
import { detectTitleRace } from './rules/title-race.js';
import { detectRelegation } from './rules/relegation.js';
import { detectQualification } from './rules/qualification.js';
import { detectCriticalFixtures } from './rules/critical-fixture.js';
import { detectMomentum } from './rules/momentum.js';
import { scoreStory } from './scorer.js';

export interface DetectedStory {
  type: string;
  league_id: number;
  headline: string;
  payload: Record<string, unknown>;
  score?: number;
}

export interface ScoredStory extends DetectedStory {
  score: number;
}

export function detectStories(): ScoredStory[] {
  const allStories: ScoredStory[] = [];
  const enabledTypes = new Set(config.enabledStoryTypes);

  for (const leagueId of config.enabledLeagues) {
    // League cooldown check
    if (isLeagueOnCooldown(leagueId)) {
      logger.info({ leagueId }, 'League on cooldown, skipping');
      continue;
    }

    const standings = getLatestStandings(leagueId);
    if (standings.length === 0) {
      logger.warn({ leagueId }, 'No standings data, skipping detection');
      continue;
    }

    const upcoming = getUpcomingFixtures(leagueId);
    let stories: DetectedStory[] = [];

    if (enabledTypes.has('title_race')) {
      stories.push(...detectTitleRace(leagueId, standings));
    }
    if (enabledTypes.has('relegation')) {
      stories.push(...detectRelegation(leagueId, standings));
    }
    if (enabledTypes.has('qualification')) {
      stories.push(...detectQualification(leagueId, standings));
    }
    if (enabledTypes.has('critical_fixture')) {
      stories.push(...detectCriticalFixtures(leagueId, standings, upcoming));
    }
    if (enabledTypes.has('momentum')) {
      stories.push(...detectMomentum(leagueId, standings));
    }

    // Score each story
    const scored = stories.map(s => ({
      ...s,
      score: scoreStory(s, standings),
    }));

    allStories.push(...scored);
  }

  // Sort by score descending, cap at maxStoriesPerRun
  allStories.sort((a, b) => b.score - a.score);
  const capped = allStories.slice(0, config.maxStoriesPerRun);

  logger.info({ detected: allStories.length, returned: capped.length }, 'Detection complete');
  return capped;
}

function isLeagueOnCooldown(leagueId: number): boolean {
  const last = getLastStoryForLeague(leagueId);
  if (!last) return false;

  const lastTime = new Date(last.created_at).getTime();
  const cooldownMs = config.leagueCooldownHours * 60 * 60 * 1000;
  return Date.now() - lastTime < cooldownMs;
}
