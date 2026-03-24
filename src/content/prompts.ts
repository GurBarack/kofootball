import { config } from '../config.js';
import type { ScoredStory } from '../detection/detector.js';

const TONE_BLOCK = config.tone.system.map(line => `- ${line}`).join('\n');

const SYSTEM_PROMPT = `You write football social media content. You are not a journalist. You're the friend in the group chat who actually watches every game and sees things others miss.

TONE:
${TONE_BLOCK}

OUTPUT FORMAT — you must write exactly 3 labeled sections:

MAIN:
[Your strongest take. 2-3 sentences max. Must include at least one hard stat (points, gap, form, games left). This is the one that gets posted.]

DATA:
[A more analytical angle. Lead with numbers. Different insight from MAIN. 1-2 sentences.]

EDGE:
[The most provocative or minimal version. A single punchy line or hot take. Could be a question.]

RULES:
- Every section must reference at least one concrete fact from the data
- No two sections should make the same point
- No hashtags, no emojis
- Never use: "it's all to play for", "crunch time", "must-win", "drama", "scenes", "huge", "massive"
- Don't narrate — react. Write like you just saw the table and can't keep quiet.`;

function buildContext(story: ScoredStory): string {
  const leagueName = config.leagues[story.league_id] || `League ${story.league_id}`;
  const payload = story.payload as Record<string, unknown>;

  let context = `League: ${leagueName}\nStory: ${story.type}\n`;

  const teams = payload.teams as Array<Record<string, unknown>> | undefined;
  if (teams) {
    context += '\nTable:\n';
    for (const t of teams) {
      const parts = [`${t.name}`, `${t.points}pts`];
      if (t.rank) parts.push(`#${t.rank}`);
      if (t.form) parts.push(`form: ${t.form}`);
      if (t.goal_diff !== undefined && t.goal_diff !== 'N/A') parts.push(`GD ${Number(t.goal_diff) > 0 ? '+' : ''}${t.goal_diff}`);
      context += `  ${parts.join(' | ')}\n`;
    }
  }

  if (payload.gamesLeft !== undefined) context += `\nGames left: ${payload.gamesLeft}`;
  if (payload.pointGap !== undefined) context += `\nGap: ${payload.pointGap} points`;
  if (payload.gapAtCutoff !== undefined) context += `\nGap at cutoff: ${payload.gapAtCutoff} points`;
  if (payload.cutoffRank) context += `\nRelegation line: position ${payload.cutoffRank}`;
  if (payload.streakType) context += `\nStreak: ${payload.streakType} | Recent form: ${payload.form}`;
  if (payload.fixture) {
    const fix = payload.fixture as Record<string, unknown>;
    context += `\nNext fixture: ${fix.home} vs ${fix.away} (${fix.round})`;
  }

  return context;
}

const TYPE_INSTRUCTIONS: Record<string, string> = {
  title_race: 'Who actually looks like winners? Who is bottling it? Use the form and GD to back it up.',
  relegation: 'Who is already gone? Who has a chance? Look at form — that tells the real story at the bottom.',
  qualification: 'European spots change clubs. Who earned it and who is coasting into it? Use the form runs.',
  critical_fixture: 'This fixture decides something. What specifically is at stake for each side? Be concrete.',
  momentum: 'This form run means something. Connect it to where they are in the table. What happens if this continues?',
};

export function buildPrompt(story: ScoredStory): { system: string; user: string } {
  const context = buildContext(story);
  const typeInstruction = TYPE_INSTRUCTIONS[story.type] || '';

  return {
    system: SYSTEM_PROMPT,
    user: `${context}\n\n${typeInstruction}`,
  };
}
