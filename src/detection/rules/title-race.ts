import type { StandingRow } from '../../storage/standings-repo.js';
import type { DetectedStory } from '../detector.js';

const MAX_POINT_GAP = 6;
const TOP_N = 4;

export function detectTitleRace(leagueId: number, standings: StandingRow[]): DetectedStory[] {
  if (standings.length < 3) return [];

  const top = standings.slice(0, TOP_N);
  const leader = top[0];
  const contenders = top.filter(t => leader.points - t.points <= MAX_POINT_GAP);

  if (contenders.length < 2) return [];

  const gap = leader.points - contenders[contenders.length - 1].points;
  const gamesLeft = estimateGamesLeft(leader.played);

  return [{
    type: 'title_race',
    league_id: leagueId,
    headline: `${contenders.map(t => t.team_name).join(' vs ')} — ${gap}pt gap, ${gamesLeft} games left`,
    payload: {
      teams: contenders.map(t => ({
        name: t.team_name,
        rank: t.rank,
        points: t.points,
        played: t.played,
        form: t.form,
        goal_diff: t.goal_diff,
      })),
      pointGap: gap,
      gamesLeft,
    },
  }];
}

function estimateGamesLeft(played: number): number {
  return Math.max(0, 38 - played); // Most top leagues have 38 matchdays
}
