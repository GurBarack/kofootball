// ── Feed sources ─────────────────────────────────────────────────────────

export interface FeedSource {
  name: string;
  url: string;
}

export const FEEDS: FeedSource[] = [
  { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml' },
  { name: 'Guardian Football', url: 'https://www.theguardian.com/football/rss' },
  { name: 'ESPN FC', url: 'https://www.espn.com/espn/rss/soccer/news' },
  { name: 'Sky Sports', url: 'https://www.skysports.com/rss/12040' },
];

// ── Team matching ────────────────────────────────────────────────────────

// Canonical name → search terms (lowercase). Order matters: longer/more-specific first.
const TEAM_ALIASES: Record<string, string[]> = {
  // Premier League
  'arsenal': ['arsenal', 'gunners'],
  'man city': ['manchester city', 'man city'],
  'liverpool': ['liverpool'],
  'chelsea': ['chelsea'],
  'man utd': ['manchester united', 'man utd', 'man united'],
  'tottenham': ['tottenham', 'spurs'],
  'newcastle': ['newcastle'],
  'aston villa': ['aston villa'],
  'brighton': ['brighton'],
  'west ham': ['west ham'],
  'crystal palace': ['crystal palace'],
  'fulham': ['fulham'],
  'wolves': ['wolverhampton', 'wolves'],
  'everton': ['everton'],
  'bournemouth': ['bournemouth'],
  'nott forest': ['nottingham forest', 'nott forest'],
  // La Liga
  'barcelona': ['barcelona', 'barca', 'barça'],
  'real madrid': ['real madrid'],
  'atletico madrid': ['atletico madrid', 'atlético madrid', 'atleti'],
  'real sociedad': ['real sociedad'],
  'athletic club': ['athletic bilbao', 'athletic club'],
  'villarreal': ['villarreal'],
  'real betis': ['real betis'],
  'sevilla': ['sevilla'],
  'girona': ['girona'],
};

/**
 * Find all canonical team names mentioned in a text string.
 * Returns deduplicated lowercase canonical names.
 */
export function matchTeams(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];

  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    for (const alias of aliases) {
      if (lower.includes(alias)) {
        found.push(canonical);
        break; // one match per canonical name is enough
      }
    }
  }

  return found;
}
