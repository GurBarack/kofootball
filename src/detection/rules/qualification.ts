import type { StandingRow } from '../../storage/standings-repo.js';
import type { DetectedStory } from '../detector.js';

// European qualification spots vary by league — use top 6 as a general rule
const QUALIFICATION_SPOTS = 6;
const POINT_RANGE = 5;

export function detectQualification(leagueId: number, standings: StandingRow[]): DetectedStory[] {
  if (standings.length < 8) return [];

  const aroundCutoff = standings.filter(t =>
    t.rank >= QUALIFICATION_SPOTS - 2 && t.rank <= QUALIFICATION_SPOTS + 3
  );

  if (aroundCutoff.length < 2) return [];

  const lastQualifier = standings[QUALIFICATION_SPOTS - 1];
  const firstOut = standings[QUALIFICATION_SPOTS];
  if (!lastQualifier || !firstOut) return [];

  const gap = lastQualifier.points - firstOut.points;
  if (gap > POINT_RANGE) return [];

  const contested = aroundCutoff.filter(t =>
    Math.abs(t.points - lastQualifier.points) <= POINT_RANGE
  );

  if (contested.length < 3) return [];

  const gamesLeft = Math.max(0, 38 - lastQualifier.played);

  return [{
    type: 'qualification',
    league_id: leagueId,
    headline: `European spots race: ${contested.length} teams fighting for top ${QUALIFICATION_SPOTS}`,
    payload: {
      teams: contested.map(t => ({
        name: t.team_name,
        rank: t.rank,
        points: t.points,
        form: t.form,
      })),
      cutoffPosition: QUALIFICATION_SPOTS,
      gapAtCutoff: gap,
      gamesLeft,
    },
  }];
}
