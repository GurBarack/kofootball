import type { StandingRow } from '../../storage/standings-repo.js';
import type { FixtureRow } from '../../storage/fixtures-repo.js';
import type { DetectedStory } from '../detector.js';

const TOP_N = 6;
const BOTTOM_N = 6;

export function detectCriticalFixtures(
  leagueId: number,
  standings: StandingRow[],
  upcoming: FixtureRow[]
): DetectedStory[] {
  if (standings.length < 6 || upcoming.length === 0) return [];

  const stories: DetectedStory[] = [];
  const teamMap = new Map(standings.map(s => [s.team_id, s]));
  const topTeamIds = new Set(standings.slice(0, TOP_N).map(s => s.team_id));
  const bottomTeamIds = new Set(standings.slice(-BOTTOM_N).map(s => s.team_id));

  for (const fix of upcoming) {
    const homeId = fix.home_team_id;
    const awayId = fix.away_team_id;
    if (!homeId || !awayId) continue;

    const bothTop = topTeamIds.has(homeId) && topTeamIds.has(awayId);
    const bothBottom = bottomTeamIds.has(homeId) && bottomTeamIds.has(awayId);

    if (!bothTop && !bothBottom) continue;

    const home = teamMap.get(homeId);
    const away = teamMap.get(awayId);
    if (!home || !away) continue;

    const context = bothTop ? 'title/European' : 'relegation';
    const pointGap = Math.abs(home.points - away.points);

    stories.push({
      type: 'critical_fixture',
      league_id: leagueId,
      headline: `${fix.home_team} vs ${fix.away_team} — direct ${context} clash (${pointGap}pt gap)`,
      payload: {
        fixture: { home: fix.home_team, away: fix.away_team, date: fix.date, round: fix.round },
        homeStanding: { rank: home.rank, points: home.points, form: home.form },
        awayStanding: { rank: away.rank, points: away.points, form: away.form },
        context,
        pointGap,
      },
    });
  }

  return stories;
}
