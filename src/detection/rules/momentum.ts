import type { StandingRow } from '../../storage/standings-repo.js';
import type { DetectedStory } from '../detector.js';

const MIN_FORM_LENGTH = 4;
const STREAK_THRESHOLD = 4; // 4+ consecutive same results

export function detectMomentum(leagueId: number, standings: StandingRow[]): DetectedStory[] {
  const stories: DetectedStory[] = [];

  for (const team of standings) {
    if (!team.form || team.form.length < MIN_FORM_LENGTH) continue;

    const form = team.form.slice(-5); // Last 5 results
    const wins = form.split('').filter(c => c === 'W').length;
    const losses = form.split('').filter(c => c === 'L').length;

    // Hot streak: 4+ wins in last 5
    if (wins >= STREAK_THRESHOLD) {
      stories.push({
        type: 'momentum',
        league_id: leagueId,
        headline: `${team.team_name} on fire: ${wins} wins in last 5 (rank #${team.rank})`,
        payload: {
          team: team.team_name,
          form,
          rank: team.rank,
          points: team.points,
          streakType: 'hot',
          winsInLast5: wins,
        },
      });
    }

    // Cold streak: 4+ losses in last 5
    if (losses >= STREAK_THRESHOLD) {
      stories.push({
        type: 'momentum',
        league_id: leagueId,
        headline: `${team.team_name} in freefall: ${losses} losses in last 5 (rank #${team.rank})`,
        payload: {
          team: team.team_name,
          form,
          rank: team.rank,
          points: team.points,
          streakType: 'cold',
          lossesInLast5: losses,
        },
      });
    }
  }

  return stories;
}
