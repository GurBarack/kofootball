/**
 * End-to-end pipeline demo with mock data.
 * No API keys — exercises: detection → scoring → safety filters → formatting → output.
 * Simulates what runPipeline() does, with mock fetch + mock LLM.
 */
import { getDb } from '../src/storage/db.js';
import { logger } from '../src/utils/logger.js';
import { detectStories } from '../src/detection/detector.js';
import { preFilter, postFilter } from '../src/safety/filters.js';
import { parseVariants, formatForTelegramHtml, type StructuredContent } from '../src/content/formatter.js';
import type { ScoredStory } from '../src/detection/detector.js';

// ── Seed mock standings directly into DB ────────────────────────────────

function seedMockData() {
  const db = getDb();
  const now = new Date().toISOString();

  // Clear old test data
  db.prepare('DELETE FROM standings_snapshots WHERE league_id = 39').run();
  db.prepare('DELETE FROM stories WHERE league_id = 39').run();

  const insert = db.prepare(`
    INSERT INTO standings_snapshots
      (league_id, season, team_id, team_name, team_logo, rank, points, played, won, drawn, lost, goal_diff, form, fetched_at)
    VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const teams = [
    [42, 'Arsenal', 1, 76, 32, 23, 7, 2, 45, 'WWDWW'],
    [50, 'Manchester City', 2, 74, 32, 22, 8, 2, 48, 'WWWDL'],
    [40, 'Liverpool', 3, 72, 32, 22, 6, 4, 42, 'WLWWW'],
    [47, 'Tottenham', 4, 58, 32, 17, 7, 8, 18, 'DWLWL'],
    [66, 'Aston Villa', 5, 56, 32, 16, 8, 8, 12, 'WDWDW'],
    [34, 'Newcastle', 6, 55, 32, 16, 7, 9, 14, 'WWWWL'],
    [51, 'Brighton', 7, 53, 32, 15, 8, 9, 8, 'DLDWW'],
    [48, 'West Ham', 8, 45, 32, 12, 9, 11, 2, 'LWDWL'],
    [55, 'Brentford', 9, 43, 32, 12, 7, 13, -3, 'WLLWW'],
    [63, 'Fulham', 10, 42, 32, 11, 9, 12, -5, 'DDLWL'],
    [62, 'Crystal Palace', 11, 40, 32, 10, 10, 12, -8, 'LDDDW'],
    [52, 'Chelsea', 12, 39, 32, 10, 9, 13, -4, 'LLLWW'],
    [39, 'Wolves', 13, 37, 32, 9, 10, 13, -10, 'DDLWL'],
    [45, 'Everton', 14, 35, 32, 9, 8, 15, -14, 'LLWDL'],
    [65, 'Nottm Forest', 15, 33, 32, 8, 9, 15, -16, 'LLLLD'],
    [46, 'Leicester', 16, 31, 32, 7, 10, 15, -18, 'LDLLL'],
    [36, 'Bournemouth', 17, 30, 32, 7, 9, 16, -19, 'LLLDL'],
    [41, 'Southampton', 18, 28, 32, 6, 10, 16, -22, 'DLLDL'],
    [57, 'Ipswich', 19, 25, 32, 5, 10, 17, -26, 'LLLLW'],
    [33, 'Luton', 20, 20, 32, 4, 8, 20, -34, 'LLLLL'],
  ];

  const tx = db.transaction(() => {
    for (const t of teams) {
      insert.run(39, 2025, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], t[9], now);
    }
  });
  tx();
  console.log(`Seeded ${teams.length} teams into standings_snapshots\n`);
}

// ── Mock LLM responses (keyed by story type) ───────────────────────────

const MOCK_LLM: Record<string, string> = {
  title_race: `MAIN: Arsenal have the fewest losses in the league and the least control over the title. Two defeats all season, 76 points, top of the table — and it still might not be enough. City's GD is +48, three better than Arsenal's, on two fewer wins. Liverpool won 4 of their last 5 and nobody's talking about them. Arsenal are first and still playing like they're chasing.
DATA: Arsenal 76, City 74, Liverpool 72. City's 8 draws are the most in the top 3 but their 2 losses are tied for fewest. Liverpool's form is the sharpest right now: WLWWW, 4 in 5. Arsenal's WWDWW looks solid until you see City closed a 6-point gap to 2 in three weeks.
EDGE: The best defensive record in the league and Arsenal still can't breathe.`,

  relegation: `MAIN: One win in 15 games between them. That's Leicester, Bournemouth and Southampton — three teams separated by 3 points, all trying to avoid 18th, none of them able to do the one thing that would help. Bournemouth have lost 16, worst in the league outside Luton. Southampton drew 10 and turned none of it into survival. Six games left and the bottom of this league has forgotten how to win.
DATA: Leicester 31pts (form: LDLLL), Bournemouth 30 (LLLDL), Southampton 28 (DLLDL). Combined: 1 win in 15. Ipswich sit on 25 but their LLLLW includes the only bottom-5 win in the last two matchdays. Luton at 20, GD -34, haven't won since February.
EDGE: Southampton have drawn 10 games and still can't stay up.`,

  qualification: `MAIN: Tottenham, Villa and Newcastle are separated by 3 points for 3 European spots. None of them are convincing. Spurs have lost 3 of their last 5. Villa drew their way to 5th. Newcastle won 4 straight then lost — a summary of their entire season. The 4-6 race will be decided by who collapses slowest.
DATA: Tottenham 58pts (DWLWL), Aston Villa 56 (WDWDW), Newcastle 55 (WWWWL). Villa's 8 draws are the most in the top 8. Newcastle's GD of +14 is best of the three but their form just cracked. Spurs haven't won consecutive league games since January.
EDGE: Three clubs racing for Europe and the best form any of them can manage is WDWDW.`,

  momentum: `MAIN: Luton have lost 5 straight. GD is -34 and they're 8 points from safety with 6 games left. Mathematically alive. Practically finished. They've conceded in every game since matchday 24 and their last clean sheet was against a 10-man side.
DATA: LLLLL — the only team in the league with 5 consecutive losses. 4 wins all season, 8 draws, 20 defeats. They're averaging 0.63 points per game. Staying up requires roughly 36. They have 20.
EDGE: Luton aren't going down fighting. They're just going down.`,
};

function mockGenerate(story: ScoredStory): StructuredContent {
  const raw = MOCK_LLM[story.type];
  if (raw) return parseVariants(raw);
  // Fallback
  return parseVariants(
    `MAIN: ${story.headline}\nDATA: Score: ${story.score}\nEDGE: ${story.type}`,
  );
}

// ── Run ─────────────────────────────────────────────────────────────────

function run() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  FULL PIPELINE DEMO (mock data, mock LLM)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Step 1: seed data
  console.log('STEP 1: Fetch data (mock)\n');
  seedMockData();

  // Step 2: detect
  console.log('STEP 2: Detect stories\n');
  const stories = detectStories();
  console.log(`  Detected ${stories.length} stories:\n`);
  for (const s of stories) {
    console.log(`  [${s.score}] ${s.type} — ${s.headline}`);
  }
  console.log('');

  // Step 3: safety filters
  console.log('STEP 3: Safety filters (pre-generation)\n');
  const passed: ScoredStory[] = [];
  for (const story of stories) {
    const result = preFilter(story);
    const status = result.passed ? 'PASS' : `FILTERED: ${result.reason}`;
    console.log(`  [${story.score}] ${story.type}: ${status}`);
    if (result.passed) passed.push(story);
  }
  console.log(`\n  ${passed.length}/${stories.length} stories passed pre-filter\n`);

  // Step 4: generate + quality check
  console.log('STEP 4: Generate content + quality check\n');
  const ready: Array<{ story: ScoredStory; content: StructuredContent }> = [];

  for (const story of passed) {
    const content = mockGenerate(story);
    const quality = postFilter(content);

    if (quality.passed) {
      console.log(`  [${story.score}] ${story.type}: PASS`);
      ready.push({ story, content });
    } else {
      console.log(`  [${story.score}] ${story.type}: QUALITY FAIL — ${quality.reason}`);
    }
  }
  console.log(`\n  ${ready.length}/${passed.length} stories passed quality check\n`);

  // Step 5: format for delivery
  console.log('STEP 5: Telegram output\n');
  for (const { story, content } of ready) {
    console.log('───────────────────────────────────────────────────────────────');
    console.log(formatForTelegramHtml(story, content));
    console.log('');
  }

  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  PIPELINE SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Detected:  ${stories.length}`);
  console.log(`  Pre-filter: ${passed.length}`);
  console.log(`  Generated: ${ready.length}`);
  console.log(`  Ready to deliver: ${ready.length}`);
  console.log('');
}

run();
