/**
 * Demo: shows improved detection + prompt + formatted output with mock data.
 * No API keys needed.
 */
import { buildPrompt } from '../src/content/prompts.js';
import { formatForTelegram, type StructuredContent } from '../src/content/formatter.js';
import { scoreStory } from '../src/detection/scorer.js';
import type { DetectedStory, ScoredStory } from '../src/detection/detector.js';
import type { StandingRow } from '../src/storage/standings-repo.js';

// ── Mock PL standings (matchday 32/38) ──────────────────────────────────
const mockPLStandings: StandingRow[] = [
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

// ── Detection imports ───────────────────────────────────────────────────
import { detectTitleRace } from '../src/detection/rules/title-race.js';
import { detectRelegation } from '../src/detection/rules/relegation.js';

// ── Mock content that matches the new MAIN/DATA/EDGE structure ──────────

const MOCK_TITLE_RACE: StructuredContent = {
  main: "Arsenal have lost 2 games all season and they're still looking over their shoulder. City's GD is +48 — best in the league — and Liverpool just won 4 of their last 5. A 4-point lead with 6 games left means nothing when the two teams behind you are playing like that.",
  data: "76, 74, 72. Three teams separated by 4 points after 32 games. Arsenal's form reads WWDWW but City have the better goal difference by 3. Liverpool's WLWWW is the most dangerous run — they're peaking at the right time.",
  edge: "Arsenal are top and somehow feel like the most nervous team in this race.",
};

const MOCK_RELEGATION: StructuredContent = {
  main: "Luton are on LLLLL and 8 points from safety. That's not a relegation battle, that's a funeral. The real fight is above them — Southampton, Ipswich, Bournemouth and Leicester are separated by 6 points with 6 games left, and none of them can string two results together.",
  data: "4 teams in 5 points between 16th and 19th. Leicester's form: LDLLL. Bournemouth's: LLLDL. Southampton's: DLLDL. Combined record in the last 15 games: 2 wins. Two.",
  edge: "Luton's GD is -34. At some point you stop calling it a relegation fight and just call it what it is.",
};

function run() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  KO FOOTBALL — Improved Content Structure Demo');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── Title Race ─────────────────────────────────────────────────────────
  const titleStories = detectTitleRace(39, mockPLStandings);
  if (titleStories.length > 0) {
    const scored: ScoredStory = {
      ...titleStories[0],
      score: scoreStory(titleStories[0], mockPLStandings),
    };

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  EXAMPLE 1: TITLE RACE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Show the prompt that goes to the LLM
    const { system, user } = buildPrompt(scored);
    console.log('── LLM SYSTEM PROMPT ──');
    console.log(system);
    console.log('\n── LLM USER PROMPT ──');
    console.log(user);

    // Show formatted Telegram output
    console.log('\n── TELEGRAM OUTPUT ──');
    console.log(formatForTelegram(scored, MOCK_TITLE_RACE));
    console.log('');
  }

  // ── Relegation ─────────────────────────────────────────────────────────
  const relStories = detectRelegation(39, mockPLStandings);
  if (relStories.length > 0) {
    const scored: ScoredStory = {
      ...relStories[0],
      score: scoreStory(relStories[0], mockPLStandings),
    };

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  EXAMPLE 2: RELEGATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { system, user } = buildPrompt(scored);
    console.log('── LLM SYSTEM PROMPT ──');
    console.log(system);
    console.log('\n── LLM USER PROMPT ──');
    console.log(user);

    console.log('\n── TELEGRAM OUTPUT ──');
    console.log(formatForTelegram(scored, MOCK_RELEGATION));
    console.log('');
  }
}

run();
