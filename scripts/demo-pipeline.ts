/**
 * Full pipeline simulation — two leagues, realistic data, per-story LLM mocks.
 * Exercises the complete flow: seed → detect → score → pre-filter → generate → quality → deliver.
 * Network-independent (no API keys needed).
 */
import { config } from '../src/config.js';
import { getDb } from '../src/storage/db.js';
import { detectStories } from '../src/detection/detector.js';
import { preFilter, postFilter } from '../src/safety/filters.js';
import { parseVariants, type StructuredContent } from '../src/content/formatter.js';
import { generateHashtags } from '../src/content/hashtags.js';
import { buildPostCandidates, formatForX } from '../src/content/post-builder.js';
import type { ScoredStory } from '../src/detection/detector.js';

// ── Seed PL + La Liga into DB ───────────────────────────────────────────

function seedData() {
  const db = getDb();
  const now = new Date().toISOString();

  db.prepare('DELETE FROM standings_snapshots').run();
  db.prepare('DELETE FROM stories').run();
  db.prepare('DELETE FROM fixtures').run();

  const insertStandings = db.prepare(`
    INSERT INTO standings_snapshots
      (league_id, season, team_id, team_name, team_logo, rank, points, played, won, drawn, lost, goal_diff, form, fetched_at)
    VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Premier League — matchday 30, late March 2026
  const pl = [
    [42, 'Arsenal',          1, 71, 30, 22, 5, 3, 39, 'WWWDW'],
    [40, 'Liverpool',        2, 70, 30, 22, 4, 4, 43, 'WLWWW'],
    [50, 'Manchester City',  3, 67, 30, 20, 7, 3, 41, 'DWWWL'],
    [49, 'Chelsea',          4, 55, 30, 16, 7, 7, 15, 'WDWLW'],
    [66, 'Aston Villa',      5, 53, 30, 15, 8, 7, 11, 'WDWDW'],
    [34, 'Newcastle',        6, 52, 30, 15, 7, 8, 16, 'WWWWL'],
    [35, 'Bournemouth',      7, 50, 30, 14, 8, 8,  6, 'DWWLD'],
    [51, 'Brighton',         8, 47, 30, 13, 8, 9,  4, 'DLDWW'],
    [36, 'Fulham',           9, 44, 30, 12, 8, 10, -2, 'DDLWL'],
    [33, 'Manchester Utd',  10, 41, 30, 11, 8, 11, -6, 'LWDWL'],
    [47, 'Tottenham',       11, 40, 30, 11, 7, 12, -4, 'LLWDL'],
    [48, 'West Ham',        12, 38, 30, 10, 8, 12, -8, 'WLLDW'],
    [55, 'Brentford',       13, 36, 30, 10, 6, 14, -5, 'WLLWW'],
    [39, 'Wolves',          14, 33, 30,  9, 6, 15, -12, 'DDLWL'],
    [62, 'Crystal Palace',  15, 31, 30,  8, 7, 15, -11, 'LDDDW'],
    [65, 'Nottm Forest',    16, 30, 30,  8, 6, 16, -14, 'LLDWL'],
    [45, 'Everton',         17, 28, 30,  7, 7, 16, -18, 'LLLDL'],
    [46, 'Leicester',       18, 27, 30,  7, 6, 17, -21, 'LLLLD'],
    [57, 'Ipswich',         19, 22, 30,  5, 7, 18, -28, 'LLLLW'],
    [41, 'Southampton',     20, 17, 30,  3, 8, 19, -36, 'LLLLL'],
  ];

  // La Liga — matchday 30, late March 2026
  const laLiga = [
    [541, 'Real Madrid',     1, 72, 30, 22, 6, 2, 38, 'WWDWW'],
    [529, 'Barcelona',       2, 70, 30, 22, 4, 4, 42, 'WWWLW'],
    [530, 'Atletico Madrid', 3, 65, 30, 19, 8, 3, 24, 'DWDWW'],
    [531, 'Athletic Bilbao', 4, 55, 30, 16, 7, 7, 14, 'WLWWW'],
    [548, 'Real Sociedad',   5, 50, 30, 14, 8, 8,  8, 'DLWWD'],
    [532, 'Villarreal',      6, 49, 30, 14, 7, 9, 10, 'WDWLD'],
    [533, 'Real Betis',      7, 47, 30, 13, 8, 9,  5, 'LWWDL'],
    [546, 'Girona',          8, 44, 30, 12, 8, 10,  1, 'WDLWW'],
    [543, 'Osasuna',         9, 40, 30, 11, 7, 12, -3, 'DLLWW'],
    [536, 'Sevilla',        10, 39, 30, 10, 9, 11, -4, 'LWDLD'],
    [538, 'Celta Vigo',     11, 37, 30, 10, 7, 13, -8, 'WLDLW'],
    [534, 'Getafe',         12, 36, 30,  9, 9, 12, -6, 'DDLLD'],
    [540, 'Espanyol',       13, 35, 30,  9, 8, 13, -9, 'LDWDL'],
    [728, 'Rayo Vallecano', 14, 33, 30,  8, 9, 13, -7, 'DLLWL'],
    [539, 'Leganes',        15, 31, 30,  8, 7, 15, -12, 'LLDWL'],
    [535, 'Mallorca',       16, 30, 30,  7, 9, 14, -11, 'DLDLL'],
    [537, 'Las Palmas',     17, 28, 30,  7, 7, 16, -16, 'LLLWL'],
    [542, 'Alaves',         18, 25, 30,  6, 7, 17, -19, 'LLDLL'],
    [544, 'Valladolid',     19, 22, 30,  5, 7, 18, -24, 'LLLDL'],
    [547, 'Cadiz',          20, 18, 30,  4, 6, 20, -30, 'LLLLL'],
  ];

  // Upcoming fixtures (PL top clashes + relegation six-pointers)
  const insertFixture = db.prepare(`
    INSERT INTO fixtures
      (league_id, fixture_id, home_team, home_team_id, home_logo, away_team, away_team_id, away_logo,
       home_goals, away_goals, status, date, round, fetched_at)
    VALUES (?, ?, ?, ?, '', ?, ?, '', ?, ?, ?, ?, ?, ?)
  `);

  const fixtures = [
    [39, 90001, 'Arsenal', 42, 'Liverpool', 40, null, null, 'NS', '2026-03-29T17:30:00Z', 'Regular Season - 31'],
    [39, 90002, 'Newcastle', 34, 'Chelsea', 49, null, null, 'NS', '2026-03-29T15:00:00Z', 'Regular Season - 31'],
    [39, 90003, 'Everton', 45, 'Leicester', 46, null, null, 'NS', '2026-03-29T15:00:00Z', 'Regular Season - 31'],
    [39, 90004, 'Ipswich', 57, 'Southampton', 41, null, null, 'NS', '2026-03-29T15:00:00Z', 'Regular Season - 31'],
    [140, 90005, 'Real Madrid', 541, 'Barcelona', 529, null, null, 'NS', '2026-03-30T20:00:00Z', 'Regular Season - 31'],
    [140, 90006, 'Alaves', 542, 'Cadiz', 547, null, null, 'NS', '2026-03-30T16:15:00Z', 'Regular Season - 31'],
  ];

  const tx = db.transaction(() => {
    for (const t of pl) {
      insertStandings.run(39, 2025, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], t[9], now);
    }
    for (const t of laLiga) {
      insertStandings.run(140, 2025, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], t[9], now);
    }
    for (const f of fixtures) {
      insertFixture.run(f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7], f[8], f[9], f[10], now);
    }
  });
  tx();

  console.log(`  Premier League: ${pl.length} teams, ${fixtures.filter(f => f[0] === 39).length} fixtures`);
  console.log(`  La Liga:        ${laLiga.length} teams, ${fixtures.filter(f => f[0] === 140).length} fixtures`);
}

// ── Per-story mock LLM content ──────────────────────────────────────────

function mockLlmKey(story: ScoredStory): string {
  return `${story.league_id}:${story.type}`;
}

const MOCK_LLM: Record<string, string> = {
  // PL
  '39:title_race': `MAIN: Arsenal lead Liverpool by a single point with 8 games left. One point. That's the margin after 30 matchdays of relentless football. Liverpool's +43 GD tops the league, City are 5 points back and have drawn 7 — they've lost less than anyone but won less than the top two. The title is a two-horse race that City keep crashing.
DATA: Arsenal 71pts (WWWDW), Liverpool 70 (WLWWW), City 67 (DWWWL). Arsenal have 3 losses all season. Liverpool have 4 but 22 wins — same as Arsenal. City's 7 draws cost them a title challenge that mathematically still exists.
EDGE: Liverpool's GD is the best in the league. Arsenal's is third. Guess who's top.`,

  '39:qualification': `MAIN: Chelsea, Villa, Newcastle and Bournemouth are separated by 5 points between 4th and 7th. Four clubs, three European tickets, and none of them look certain. Villa drew 8 games — comfort draws that might cost them the continent. Newcastle won 4 straight then lost. Bournemouth at 50 points are one bad week from 9th.
DATA: Chelsea 55pts (WDWLW), Aston Villa 53 (WDWDW), Newcastle 52 (WWWWL), Bournemouth 50 (DWWLD). Newcastle's +16 GD is best of the four. Chelsea's is +15. Villa's 8 draws are the most in the top 8.
EDGE: Villa have drawn 8 times in 30 games. Europe doesn't reward draws.`,

  '39:relegation': `MAIN: Everton, Leicester and Ipswich are the three clubs trying to avoid joining Southampton. Everton on 28, Leicester on 27, Ipswich on 22. Southampton at 17 with 3 wins all season are already packing. The gap between 17th and 18th is one point. One point and a combined form of LLLDL and LLLLD. Neither side can win and neither side can separate themselves.
DATA: Everton 28pts (LLLDL), Leicester 27 (LLLLD), Ipswich 22 (LLLLW), Southampton 17 (LLLLL). Everton-Leicester this matchday is effectively a play-off for survival. Loser is in the bottom three. Combined: 2 wins in their last 20 league games.
EDGE: Everton vs Leicester this Saturday. Loser is 18th. Simple as that.`,

  '39:momentum': `MAIN: Southampton have lost 5 straight and won 3 games all season. GD is -36, worst in the league by 8 goals. They're 10 points from safety with 8 left — the maths says alive, everything else says finished. No team in PL history has survived from this position this late.
DATA: LLLLL — form reads like a summary, not a sequence. 3 wins, 8 draws, 19 defeats in 30 games. They need roughly 36 points for safety and have 17. That requires 19 from 24 available. Their season average is 0.57 per game.
EDGE: Southampton need to win 6 of their last 8 to stay up. They've won 3 all year.`,

  '39:critical_fixture': `MAIN: Arsenal vs Liverpool at the Emirates this Saturday. First hosts second, 1 point between them, 8 games left. Arsenal's home form is the best in the league — 13 wins from 15. Liverpool have won 4 of their last 5 away. Someone's run ends. Whoever loses hands the initiative to City, who play Wolves.
DATA: Arsenal home: W13 D1 L1, +28 GD. Liverpool away: W10 D2 L3, +16 GD. Their reverse fixture in November was 2-2. Liverpool haven't won at the Emirates in the league since 2021.
EDGE: Lose at the Emirates and you're handing City a title they don't deserve.`,

  // La Liga
  '140:title_race': `MAIN: Real Madrid and Barcelona separated by 2 points. Madrid 72, Barca 70. Eight games to decide a title that has swung three times since January. Atletico at 65 are 7 back with the most draws in the top 3 — they're not winning this, but they're ruining it for everyone. El Clasico this weekend decides who controls the final stretch.
DATA: Madrid 72pts (WWDWW, GD +38), Barcelona 70 (WWWLW, GD +42). Barcelona's GD is better. Madrid's consistency is better — 6 draws vs 4 defeats. Atletico's 8 draws make them the most frustrating third wheel in European football.
EDGE: Barcelona score more, concede more, and lead less. That's not a title formula.`,

  '140:qualification': `MAIN: Bilbao, Sociedad and Villarreal are fighting for the last two European spots. 6 points between 4th and 6th. Bilbao have won 3 of their last 4 — the best late-season form outside the top 2. Villarreal lost to Getafe last week and now Sociedad, who drew their way to mediocrity all autumn, have crept back within a point. One slip and you're watching Europa League qualifiers in July.
DATA: Athletic Bilbao 55pts (WLWWW), Real Sociedad 50 (DLWWD), Villarreal 49 (WDWLD). Bilbao's form is the sharpest: 4 wins in last 5. Sociedad's 8 draws remain the problem. Villarreal dropped 7 points in their last 5.
EDGE: Sociedad drew 8 games and still think they deserve Europe.`,

  '140:relegation': `MAIN: Alaves, Valladolid and Cadiz are in the drop zone and running out of games to change it. Cadiz at 18 points have been bottom since matchday 8. Valladolid on 22 have lost 4 of their last 5. Alaves sit 18th on 25 — only 3 points from safety but trending the wrong way. They play each other this weekend and one of them will be effectively done.
DATA: Alaves 25pts (LLDLL), Valladolid 22 (LLLDL), Cadiz 18 (LLLLL). Cadiz have the worst attack in the league: 18 goals in 30 games. Valladolid's combined form over 10 games: 1W 1D 8L. Alaves-Cadiz on Sunday is a relegation final — the loser has virtually no path to survival.
EDGE: Cadiz have scored 18 goals all season. That's not relegation form — it's confirmation.`,

  '140:critical_fixture': `MAIN: El Clasico at the Bernabeu. Real Madrid vs Barcelona with 2 points between them and 8 left to play. Madrid have lost once at home all season. Barca have the best away GD in La Liga. Last time they met, Barca won 3-2 in a game nobody who watched it has forgotten. This one decides whether the title goes to the final week or gets settled early.
DATA: Madrid home: W13 D2 L0, +30 GD. Barcelona away: W10 D1 L4, +18 GD. Madrid haven't lost at the Bernabeu this season. Barcelona's 4 away defeats are all against top-half teams.
EDGE: Two points, one game, zero margin. This is the title.`,
};

function mockGenerate(story: ScoredStory): StructuredContent {
  const key = mockLlmKey(story);
  const raw = MOCK_LLM[key];
  if (raw) return parseVariants(raw);
  // Fallback for unexpected story types
  return parseVariants(
    `MAIN: ${story.headline} — a developing situation across multiple matchdays with ${story.score} points of interest.\nDATA: Score ${story.score}. Key data points pending full analysis.\nEDGE: Watch this space.`,
  );
}

// ── Pipeline simulation ─────────────────────────────────────────────────

function run() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  FULL PIPELINE RUN — PL + La Liga, Matchday 30');
  console.log('  (network sandbox — using realistic seeded data + mock LLM)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // ── Step 1: Fetch ──
  console.log('STEP 1 — FETCH DATA\n');
  seedData();
  console.log('');

  // ── Step 2: Detect ──
  console.log('STEP 2 — DETECT STORIES\n');
  const stories = detectStories();
  console.log(`  Raw detection: ${stories.length} stories across 2 leagues\n`);
  for (const s of stories) {
    const league = config.leagues[s.league_id] || `${s.league_id}`;
    console.log(`  [${String(s.score).padStart(2)}] ${league.padEnd(15)} ${s.type.padEnd(18)} ${s.headline}`);
  }
  console.log('');

  // ── Step 3: Pre-filter ──
  console.log('STEP 3 — PRE-FILTER (score >= ' + config.minScoreThreshold + ', dedup)\n');
  const passed: ScoredStory[] = [];
  for (const story of stories) {
    const result = preFilter(story);
    const league = config.leagues[story.league_id] || `${story.league_id}`;
    if (result.passed) {
      console.log(`  ✓ [${String(story.score).padStart(2)}] ${league.padEnd(15)} ${story.type}`);
      passed.push(story);
    } else {
      console.log(`  ✗ [${String(story.score).padStart(2)}] ${league.padEnd(15)} ${story.type} — ${result.reason}`);
    }
  }
  console.log(`\n  ${passed.length}/${stories.length} passed\n`);

  // ── Step 3b: Cap ──
  const capped = passed.slice(0, config.maxStoriesPerRun);
  if (passed.length > capped.length) {
    console.log(`  Volume cap: ${passed.length} → ${capped.length} (maxStoriesPerRun=${config.maxStoriesPerRun})\n`);
  }

  // ── Step 4: Generate + quality ──
  console.log('STEP 4 — GENERATE CONTENT + QUALITY CHECK\n');
  const ready: Array<{ story: ScoredStory; content: StructuredContent }> = [];

  for (const story of capped) {
    const content = mockGenerate(story);
    const quality = postFilter(content);
    const league = config.leagues[story.league_id] || `${story.league_id}`;

    if (quality.passed) {
      console.log(`  ✓ [${String(story.score).padStart(2)}] ${league.padEnd(15)} ${story.type} — content OK (${content.main.length} chars)`);
      ready.push({ story, content });
    } else {
      console.log(`  ✗ [${String(story.score).padStart(2)}] ${league.padEnd(15)} ${story.type} — ${quality.reason}`);
    }
  }
  console.log(`\n  ${ready.length}/${capped.length} passed quality check\n`);

  // ── Step 5: Deliver (format output) ──
  console.log('STEP 5 — TELEGRAM DELIVERY (formatted output)\n');
  let deliveryRank = 1;
  for (const { story, content } of ready) {
    console.log(`  ┌─ Delivery #${deliveryRank} ─────────────────────────────────────────┐`);
    const hashtags = generateHashtags(story);
    const candidates = buildPostCandidates(content, hashtags);
    const formatted = formatForX(candidates);
    for (const f of formatted) {
      console.log(`  │ [${f.label.toUpperCase()} POST] (${f.charCount} chars)`);
      for (const line of f.fullPostText.split('\n')) {
        console.log(`  │   ${line}`);
      }
      console.log(`  │`);
    }
    console.log('  └─────────────────────────────────────────────────────────┘\n');
    deliveryRank++;
  }

  // ── Summary ──
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  RUN SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Leagues:         ${config.enabledLeagues.length} (${config.enabledLeagues.map(id => config.leagues[id]).join(', ')})`);
  console.log(`  Detected:        ${stories.length}`);
  console.log(`  Pre-filter pass: ${passed.length} (score >= ${config.minScoreThreshold})`);
  console.log(`  Volume capped:   ${capped.length} (max ${config.maxStoriesPerRun})`);
  console.log(`  Quality pass:    ${ready.length}`);
  console.log(`  Delivered:       ${ready.length}`);

  if (ready.length > 0) {
    console.log('\n  Delivery order (by score):');
    for (let i = 0; i < ready.length; i++) {
      const { story } = ready[i];
      const league = config.leagues[story.league_id] || `${story.league_id}`;
      console.log(`    #${i + 1}  [${story.score}] ${league} — ${story.type}`);
    }
  }

  const filtered = stories.filter(s => !passed.includes(s));
  if (filtered.length > 0) {
    console.log('\n  Filtered out:');
    for (const s of filtered) {
      const league = config.leagues[s.league_id] || `${s.league_id}`;
      console.log(`    [${String(s.score).padStart(2)}] ${league} — ${s.type}`);
    }
  }
  console.log('');
}

run();
