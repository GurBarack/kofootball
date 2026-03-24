/**
 * Demo script: shows detection + scoring + prompt output with mock data.
 * No API keys needed — uses seeded SQLite data and prints what the LLM would receive.
 */
import Database from 'better-sqlite3';
import { runMigrations } from '../src/storage/migrations.js';
import { buildPrompt } from '../src/content/prompts.js';
import { formatForTelegram } from '../src/content/formatter.js';
import { scoreStory } from '../src/detection/scorer.js';
import type { DetectedStory, ScoredStory } from '../src/detection/detector.js';
import type { StandingRow } from '../src/storage/standings-repo.js';

// ── Mock standings data (PL-like, late season) ──────────────────────────
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

// ── Run detection on mock data ──────────────────────────────────────────
import { detectTitleRace } from '../src/detection/rules/title-race.js';
import { detectRelegation } from '../src/detection/rules/relegation.js';
import { detectQualification } from '../src/detection/rules/qualification.js';
import { detectMomentum } from '../src/detection/rules/momentum.js';

function run() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  KO FOOTBALL — Detection + Generation Demo');
  console.log('═══════════════════════════════════════════════════════════\n');

  const allDetected: DetectedStory[] = [];

  // Title race
  const titleRace = detectTitleRace(39, mockPLStandings);
  allDetected.push(...titleRace);

  // Relegation
  const relegation = detectRelegation(39, mockPLStandings);
  allDetected.push(...relegation);

  // Qualification
  const qualification = detectQualification(39, mockPLStandings);
  allDetected.push(...qualification);

  // Momentum
  const momentum = detectMomentum(39, mockPLStandings);
  allDetected.push(...momentum);

  // Score all
  const scored: ScoredStory[] = allDetected
    .map(s => ({ ...s, score: scoreStory(s, mockPLStandings) }))
    .sort((a, b) => b.score - a.score);

  console.log(`Detected ${scored.length} stories. Top 5:\n`);

  const top5 = scored.slice(0, 5);
  for (const story of top5) {
    console.log('───────────────────────────────────────────────────────────');
    console.log(`TYPE: ${story.type} | SCORE: ${story.score}`);
    console.log(`HEADLINE: ${story.headline}\n`);

    // Show what the LLM would receive
    const { system, user } = buildPrompt(story);
    console.log('── LLM SYSTEM PROMPT ──');
    console.log(system);
    console.log('\n── LLM USER PROMPT ──');
    console.log(user);

    // Show mock formatted output
    const mockVariants = generateMockVariants(story);
    console.log('\n── TELEGRAM OUTPUT (mock variants) ──');
    console.log(formatForTelegram(story, mockVariants));
    console.log('');
  }
}

function generateMockVariants(story: ScoredStory): string[] {
  const payload = story.payload as Record<string, unknown>;

  switch (story.type) {
    case 'title_race': {
      const teams = payload.teams as Array<Record<string, unknown>>;
      const t1 = teams[0], t2 = teams[1];
      return [
        `${t1.name} lead by ${payload.pointGap} points but ${t2.name} won't blink. Six games. Two points. One of them is going to crack and it won't be pretty.`,
        `Everyone's talking about ${t1.name}'s "comfortable" lead. ${payload.pointGap} points with ${payload.gamesLeft} games left isn't comfortable. Ask anyone who watched 2012.`,
        `${t2.name} dropped points last week and the gap is still just ${payload.pointGap}. ${t1.name} aren't running away with this. They're stumbling toward the finish line.`,
      ];
    }
    case 'relegation':
      return [
        `Six teams. Five points. Three go down. The bottom of the Premier League right now is a horror movie where nobody can find the exit.`,
        `Southampton are sinking. Luton look finished. But Leicester and Bournemouth aren't safe either — one bad week and they're in the coffin.`,
      ];
    case 'momentum': {
      const team = payload.team as string;
      const form = payload.form as string;
      if ((payload.streakType as string) === 'cold') {
        return [
          `${team}: ${form}. Read that again. That's not a blip. That's a team that forgot how to win.`,
          `Five games. Zero wins. ${team} are watching the season collapse in slow motion and nothing they try is working.`,
        ];
      }
      return [
        `${team} have won ${payload.winsInLast5} of their last 5. Nobody wants to play them right now. The form table doesn't lie.`,
        `Something clicked at ${team}. ${form} in the last five — they're the form team and the table is starting to reflect it.`,
      ];
    }
    default:
      return [`[Mock variant for ${story.type}]`];
  }
}

run();
