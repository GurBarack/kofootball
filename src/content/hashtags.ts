import type { ScoredStory } from '../detection/detector.js';

const MAX_HASHTAGS = 4;

// ── Static maps ─────────────────────────────────────────────────────────

const LEAGUE_HASHTAGS: Record<number, string> = {
  39: '#PremierLeague',
  140: '#LaLiga',
  135: '#SerieA',
  78: '#Bundesliga',
  2: '#UCL',
};

const TEAM_ALIASES: Record<string, string> = {
  'Manchester City': 'ManCity',
  'Manchester United': 'ManUtd',
  'Tottenham Hotspur': 'Spurs',
  'Wolverhampton Wanderers': 'Wolves',
  'Newcastle United': 'Newcastle',
  'West Ham United': 'WestHam',
  'Leicester City': 'Leicester',
  'Nottingham Forest': 'NFFC',
  'Brighton & Hove Albion': 'Brighton',
  'Sheffield United': 'SheffieldUnited',
  'Aston Villa': 'AstonVilla',
  'Crystal Palace': 'CrystalPalace',
  'Real Madrid': 'RealMadrid',
  'Atletico Madrid': 'Atleti',
  'Athletic Club': 'AthleticClub',
  'Real Sociedad': 'RealSociedad',
  'Real Betis': 'RealBetis',
  'Celta Vigo': 'CeltaVigo',
  'Rayo Vallecano': 'RayoVallecano',
  'Las Palmas': 'LasPalmas',
  'Deportivo Alaves': 'Alaves',
  'AC Milan': 'ACMilan',
  'Inter Milan': 'Inter',
  'Borussia Dortmund': 'BVB',
  'Bayern Munich': 'FCBayern',
  'RB Leipzig': 'RBLeipzig',
  'Bayer Leverkusen': 'Leverkusen',
};

const CONTEXT_HASHTAGS: Record<string, string> = {
  title_race: '#TitleRace',
  relegation: '#RelegationBattle',
  qualification: '#TopFour',
};

// ── Helpers ─────────────────────────────────────────────────────────────

/** Convert team name to hashtag using alias map, fallback to stripping spaces */
export function teamNameToHashtag(name: string): string {
  const alias = TEAM_ALIASES[name];
  if (alias) return `#${alias}`;
  // Fallback: strip non-alphanumeric, collapse
  return `#${name.replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** Extract team names from story payload */
function extractTeamNames(story: ScoredStory): string[] {
  const payload = story.payload as Record<string, unknown>;

  // Multi-team stories (title_race, relegation, qualification)
  const teams = payload.teams as Array<{ name: string }> | undefined;
  if (teams && teams.length > 0) {
    return teams.slice(0, 2).map(t => t.name);
  }

  // Single-team stories (momentum)
  const teamName = payload.team as string | undefined;
  if (teamName) return [teamName];

  // Fixture stories (critical_fixture)
  const fixture = payload.fixture as { home: string; away: string } | undefined;
  if (fixture) return [fixture.home, fixture.away];

  return [];
}

// ── Main export ─────────────────────────────────────────────────────────

export function generateHashtags(story: ScoredStory): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();

  function add(tag: string): boolean {
    if (tags.length >= MAX_HASHTAGS) return false;
    const lower = tag.toLowerCase();
    if (seen.has(lower)) return false;
    seen.add(lower);
    tags.push(tag);
    return true;
  }

  // 1. League (always first)
  const leagueTag = LEAGUE_HASHTAGS[story.league_id];
  if (leagueTag) add(leagueTag);

  // 2. Clubs (up to 2)
  const teamNames = extractTeamNames(story);
  for (const name of teamNames) {
    if (tags.length >= MAX_HASHTAGS) break;
    add(teamNameToHashtag(name));
  }

  // 3. Context (1, if room)
  const contextTag = CONTEXT_HASHTAGS[story.type];
  if (contextTag) add(contextTag);

  return tags;
}
