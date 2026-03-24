/**
 * Demo: full Telegram preview output with mock data.
 * No API keys needed.
 */
import { buildPrompt } from '../src/content/prompts.js';
import { formatForTelegram, type StructuredContent } from '../src/content/formatter.js';
import { scoreStory } from '../src/detection/scorer.js';
import type { ScoredStory } from '../src/detection/detector.js';
import type { StandingRow } from '../src/storage/standings-repo.js';
import { detectTitleRace } from '../src/detection/rules/title-race.js';
import { detectRelegation } from '../src/detection/rules/relegation.js';

// ── Mock PL standings (matchday 32/38) ──────────────────────────────────
const standings: StandingRow[] = [
  { id:1, league_id:39, season:2025, team_id:42, team_name:'Arsenal', team_logo:'', rank:1, points:76, played:32, won:23, drawn:7, lost:2, goal_diff:45, form:'WWDWW', fetched_at:'' },
  { id:2, league_id:39, season:2025, team_id:50, team_name:'Manchester City', team_logo:'', rank:2, points:74, played:32, won:22, drawn:8, lost:2, goal_diff:48, form:'WWWDL', fetched_at:'' },
  { id:3, league_id:39, season:2025, team_id:40, team_name:'Liverpool', team_logo:'', rank:3, points:72, played:32, won:22, drawn:6, lost:4, goal_diff:42, form:'WLWWW', fetched_at:'' },
  { id:4, league_id:39, season:2025, team_id:47, team_name:'Tottenham', team_logo:'', rank:4, points:58, played:32, won:17, drawn:7, lost:8, goal_diff:18, form:'DWLWL', fetched_at:'' },
  { id:5, league_id:39, season:2025, team_id:66, team_name:'Aston Villa', team_logo:'', rank:5, points:56, played:32, won:16, drawn:8, lost:8, goal_diff:12, form:'WDWDW', fetched_at:'' },
  { id:6, league_id:39, season:2025, team_id:34, team_name:'Newcastle', team_logo:'', rank:6, points:55, played:32, won:16, drawn:7, lost:9, goal_diff:14, form:'WWWWL', fetched_at:'' },
  { id:7, league_id:39, season:2025, team_id:51, team_name:'Brighton', team_logo:'', rank:7, points:53, played:32, won:15, drawn:8, lost:9, goal_diff:8, form:'DLDWW', fetched_at:'' },
  { id:8, league_id:39, season:2025, team_id:48, team_name:'West Ham', team_logo:'', rank:8, points:45, played:32, won:12, drawn:9, lost:11, goal_diff:2, form:'LWDWL', fetched_at:'' },
  { id:9, league_id:39, season:2025, team_id:55, team_name:'Brentford', team_logo:'', rank:9, points:43, played:32, won:12, drawn:7, lost:13, goal_diff:-3, form:'WLLWW', fetched_at:'' },
  { id:10, league_id:39, season:2025, team_id:63, team_name:'Fulham', team_logo:'', rank:10, points:42, played:32, won:11, drawn:9, lost:12, goal_diff:-5, form:'DDLWL', fetched_at:'' },
  { id:11, league_id:39, season:2025, team_id:62, team_name:'Crystal Palace', team_logo:'', rank:11, points:40, played:32, won:10, drawn:10, lost:12, goal_diff:-8, form:'LDDDW', fetched_at:'' },
  { id:12, league_id:39, season:2025, team_id:52, team_name:'Chelsea', team_logo:'', rank:12, points:39, played:32, won:10, drawn:9, lost:13, goal_diff:-4, form:'LLLWW', fetched_at:'' },
  { id:13, league_id:39, season:2025, team_id:39, team_name:'Wolves', team_logo:'', rank:13, points:37, played:32, won:9, drawn:10, lost:13, goal_diff:-10, form:'DDLWL', fetched_at:'' },
  { id:14, league_id:39, season:2025, team_id:45, team_name:'Everton', team_logo:'', rank:14, points:35, played:32, won:9, drawn:8, lost:15, goal_diff:-14, form:'LLWDL', fetched_at:'' },
  { id:15, league_id:39, season:2025, team_id:65, team_name:'Nottm Forest', team_logo:'', rank:15, points:33, played:32, won:8, drawn:9, lost:15, goal_diff:-16, form:'LLLLD', fetched_at:'' },
  { id:16, league_id:39, season:2025, team_id:46, team_name:'Leicester', team_logo:'', rank:16, points:31, played:32, won:7, drawn:10, lost:15, goal_diff:-18, form:'LDLLL', fetched_at:'' },
  { id:17, league_id:39, season:2025, team_id:36, team_name:'Bournemouth', team_logo:'', rank:17, points:30, played:32, won:7, drawn:9, lost:16, goal_diff:-19, form:'LLLDL', fetched_at:'' },
  { id:18, league_id:39, season:2025, team_id:41, team_name:'Southampton', team_logo:'', rank:18, points:28, played:32, won:6, drawn:10, lost:16, goal_diff:-22, form:'DLLDL', fetched_at:'' },
  { id:19, league_id:39, season:2025, team_id:57, team_name:'Ipswich', team_logo:'', rank:19, points:25, played:32, won:5, drawn:10, lost:17, goal_diff:-26, form:'LLLLW', fetched_at:'' },
  { id:20, league_id:39, season:2025, team_id:33, team_name:'Luton', team_logo:'', rank:20, points:20, played:32, won:4, drawn:8, lost:20, goal_diff:-34, form:'LLLLL', fetched_at:'' },
];

// ── Mock content (what the LLM would produce) ───────────────────────────

const titleRaceContent: StructuredContent = {
  main: "Arsenal have the fewest losses in the league and the least control over the title. Two defeats all season, 76 points, top of the table — and none of it feels safe. City's GD is +48, three better than Arsenal's, on two fewer wins. Liverpool have won 4 of their last 5. First place belongs to the team with the least margin for error.",
  data: "Arsenal 76, City 74, Liverpool 72. City's 8 draws are the most in the top 3 but their 2 losses are tied for fewest. Liverpool's form is the sharpest in the league: WLWWW, 4 wins in 5. Arsenal's WWDWW looks stable until you notice City closed a 6-point gap to 2 in three weeks.",
  edge: "The best defensive record in the league and Arsenal still can't breathe.",
};

const relegationContent: StructuredContent = {
  main: "Three teams fighting for 17th. One win between them in their last 15 games. Leicester, Bournemouth and Southampton are separated by 3 points and united by the same problem: none of them can win a football match. Bournemouth have lost 16 — worst in the league outside Luton. Southampton have drawn 10 and converted none of that resilience into points that matter.",
  data: "Leicester 31pts (form: LDLLL), Bournemouth 30 (LLLDL), Southampton 28 (DLLDL). Combined: 1 win in 15. Ipswich sit on 25 but their LLLLW includes the only bottom-5 win in the last two matchdays. Luton at 20 pts, GD -34, have lost every game since February.",
  edge: null,  // Omitted — main already carries the sharpest framing
};

// ── Run ─────────────────────────────────────────────────────────────────

function run() {
  console.log('');

  // Title race
  const titleStories = detectTitleRace(39, standings);
  if (titleStories[0]) {
    const scored: ScoredStory = {
      ...titleStories[0],
      score: scoreStory(titleStories[0], standings),
    };
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  EXAMPLE 1: TITLE RACE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(formatForTelegram(scored, titleRaceContent));

    console.log('\n\n── PROMPT SENT TO LLM ──');
    const { user } = buildPrompt(scored);
    console.log(user);
  }

  console.log('\n');

  // Relegation
  const relStories = detectRelegation(39, standings);
  if (relStories[0]) {
    const scored: ScoredStory = {
      ...relStories[0],
      score: scoreStory(relStories[0], standings),
    };
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  EXAMPLE 2: RELEGATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(formatForTelegram(scored, relegationContent));

    console.log('\n\n── PROMPT SENT TO LLM ──');
    const { user } = buildPrompt(scored);
    console.log(user);
  }

  console.log('\n\n── PUBLISHING LOGIC ──');
  console.log('MAIN   = the post. Approve sends this.');
  console.log('DATA   = swap-in alternative (reviewer choice).');
  console.log('EDGE   = only shown if it passes quality gate. Omitted above for relegation.\n');
}

run();
