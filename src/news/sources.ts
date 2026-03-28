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

// ── Event signal detection ───────────────────────────────────────────────

export type EventType =
  | 'manager_change'
  | 'key_injury'
  | 'losing_streak'
  | 'winning_streak'
  | 'manager_pressure'
  | 'high_pressure_fixture';

const EVENT_PATTERNS: { type: EventType; patterns: RegExp[] }[] = [
  {
    type: 'manager_change',
    patterns: [/\bsacked\b/, /\bdismissed\b/, /\bfired\b/, /\bnew manager\b/, /\bnew head coach\b/, /\bappointed\b.*\bmanager\b/],
  },
  {
    type: 'key_injury',
    patterns: [/\binjur(?:y|ed)\b/, /\bruled out\b/, /\bout for\b/, /\bsidelined\b/, /\bsetback\b/],
  },
  {
    type: 'losing_streak',
    patterns: [/\d+(?:th|rd|nd|st)?\s*(?:straight|consecutive)\s*(?:loss|defeat)/, /lost\s+(?:again|\d+\s*in\s*a\s*row)/, /\bwinless\s+in\s+\d+/],
  },
  {
    type: 'winning_streak',
    patterns: [/won\s+\d+\s*in\s*a\s*row/, /\d+(?:th|rd|nd|st)?\s*(?:straight|consecutive)\s*win/, /\bunbeaten\s+in\s+\d+/],
  },
  {
    type: 'manager_pressure',
    patterns: [/\bunder pressure\b/, /\bpressure mounts\b/, /\bjob\s+(?:on the line|in danger|at risk)\b/, /\bhot seat\b/],
  },
  {
    type: 'high_pressure_fixture',
    patterns: [/\bcrucial\b/, /\bdecisive\b/, /\bmust[- ]win\b/, /\btitle[- ]decid/, /\bdo[- ]or[- ]die\b/],
  },
];

/**
 * Detect event signals from article text.
 * Returns deduplicated event types found in the text.
 */
export function matchEventSignals(text: string): EventType[] {
  const lower = text.toLowerCase();
  const found: EventType[] = [];

  for (const { type, patterns } of EVENT_PATTERNS) {
    for (const re of patterns) {
      if (re.test(lower)) {
        found.push(type);
        break; // one match per event type is enough
      }
    }
  }

  return found;
}
