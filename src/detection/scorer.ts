import type { DetectedStory } from './detector.js';
import type { StandingRow } from '../storage/standings-repo.js';

interface ScoringFactors {
  tightness: number;   // How close the competition is (0-30)
  timing: number;      // Late season = higher stakes (0-25)
  drama: number;       // Form swings, upsets, streaks (0-25)
  magnitude: number;   // Number of teams involved, stakes level (0-20)
}

export function scoreStory(story: DetectedStory, standings: StandingRow[]): number {
  const payload = story.payload as Record<string, unknown>;

  const factors: ScoringFactors = {
    tightness: scoreTightness(story, payload),
    timing: scoreTiming(payload),
    drama: scoreDrama(story, payload),
    magnitude: scoreMagnitude(story, payload),
  };

  const raw = factors.tightness + factors.timing + factors.drama + factors.magnitude;
  return Math.min(100, Math.max(0, raw));
}

function scoreTightness(story: DetectedStory, payload: Record<string, unknown>): number {
  const gap = (payload.pointGap as number) ?? (payload.gapAtCutoff as number) ?? 10;

  if (gap === 0) return 30;
  if (gap <= 1) return 27;
  if (gap <= 2) return 24;
  if (gap <= 3) return 20;
  if (gap <= 5) return 15;
  return 8;
}

function scoreTiming(payload: Record<string, unknown>): number {
  const gamesLeft = (payload.gamesLeft as number) ?? 19;

  if (gamesLeft <= 3) return 25;
  if (gamesLeft <= 5) return 22;
  if (gamesLeft <= 8) return 18;
  if (gamesLeft <= 12) return 12;
  return 5;
}

function scoreDrama(story: DetectedStory, payload: Record<string, unknown>): number {
  let score = 10; // base

  // Streaks add drama
  if (story.type === 'momentum') {
    const streakType = payload.streakType as string;
    const wins = (payload.winsInLast5 as number) ?? 0;
    const losses = (payload.lossesInLast5 as number) ?? 0;
    if (wins === 5 || losses === 5) score += 15;
    else if (wins >= 4 || losses >= 4) score += 10;

    // Top team losing = more dramatic
    const rank = (payload.rank as number) ?? 10;
    if (streakType === 'cold' && rank <= 6) score += 5;
    if (streakType === 'hot' && rank >= 15) score += 5;
  }

  // Critical fixtures between close teams
  if (story.type === 'critical_fixture') {
    const gap = (payload.pointGap as number) ?? 5;
    if (gap <= 2) score += 10;
    else if (gap <= 4) score += 5;
  }

  return Math.min(25, score);
}

function scoreMagnitude(story: DetectedStory, payload: Record<string, unknown>): number {
  const teams = payload.teams as Array<unknown> | undefined;
  const teamCount = teams?.length ?? 2;

  let score = 8; // base

  // More teams in the race = bigger story
  if (teamCount >= 4) score += 8;
  else if (teamCount >= 3) score += 5;

  // Story type weight
  if (story.type === 'title_race') score += 4;
  if (story.type === 'relegation') score += 2;

  return Math.min(20, score);
}
