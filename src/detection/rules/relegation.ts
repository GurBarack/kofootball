import type { StandingRow } from '../../storage/standings-repo.js';
import type { DetectedStory } from '../detector.js';

const RELEGATION_ZONE = 3; // Bottom 3 go down
const DANGER_RANGE = 5;    // Teams within 5 pts of zone

export function detectRelegation(leagueId: number, standings: StandingRow[]): DetectedStory[] {
  if (standings.length < 10) return [];

  const totalTeams = standings.length;
  const cutoffRank = totalTeams - RELEGATION_ZONE;
  const cutoffTeam = standings[cutoffRank]; // First safe team above zone

  if (!cutoffTeam) return [];

  const inDanger = standings.filter(t =>
    t.rank >= cutoffRank - DANGER_RANGE + 1 && t.points - cutoffTeam.points <= DANGER_RANGE
  );

  if (inDanger.length < 3) return [];

  const bottomTeam = standings[standings.length - 1];
  const gamesLeft = Math.max(0, 38 - bottomTeam.played);

  return [{
    type: 'relegation',
    league_id: leagueId,
    headline: `Relegation battle: ${inDanger.length} teams within ${DANGER_RANGE}pts of the drop`,
    payload: {
      teams: inDanger.map(t => ({
        name: t.team_name,
        rank: t.rank,
        points: t.points,
        form: t.form,
        goal_diff: t.goal_diff,
      })),
      cutoffRank: cutoffRank + 1,
      gamesLeft,
    },
  }];
}
