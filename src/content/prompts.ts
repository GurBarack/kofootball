import { config } from '../config.js';
import type { ScoredStory } from '../detection/detector.js';

const TONE_BLOCK = config.tone.system.map(line => `- ${line}`).join('\n');

const SYSTEM_PROMPT = `You generate short, punchy football social media posts.

TONE:
${TONE_BLOCK}

RULES:
- Write 2-3 variations of the same story
- Each variation is 1-3 sentences max
- Use numbers and stats when relevant
- No hashtags
- No emojis in the text itself
- Separate variations with ---
- Output ONLY the variations, nothing else`;

function buildContext(story: ScoredStory): string {
  const leagueName = config.leagues[story.league_id] || `League ${story.league_id}`;
  const payload = story.payload as Record<string, unknown>;

  let context = `League: ${leagueName}\nStory type: ${story.type}\nHeadline: ${story.headline}\n`;

  const teams = payload.teams as Array<Record<string, unknown>> | undefined;
  if (teams) {
    context += '\nTeams:\n';
    for (const t of teams) {
      context += `- ${t.name}: ${t.points}pts, rank #${t.rank || '?'}, form: ${t.form || 'N/A'}, GD: ${t.goal_diff ?? 'N/A'}\n`;
    }
  }

  if (payload.gamesLeft !== undefined) {
    context += `\nGames remaining: ${payload.gamesLeft}\n`;
  }
  if (payload.pointGap !== undefined) {
    context += `Point gap: ${payload.pointGap}\n`;
  }
  if (payload.streakType) {
    context += `Streak: ${payload.streakType} — form: ${payload.form}\n`;
  }
  if (payload.fixture) {
    const fix = payload.fixture as Record<string, unknown>;
    context += `\nFixture: ${fix.home} vs ${fix.away} (${fix.round}, ${fix.date})\n`;
  }

  return context;
}

const TYPE_INSTRUCTIONS: Record<string, string> = {
  title_race: 'Focus on the tension between the teams. Who has the edge? Who is cracking?',
  relegation: 'Emphasize the desperation. Which team looks doomed? Who might escape?',
  qualification: 'Highlight what European football means for these clubs. Who deserves it?',
  critical_fixture: 'This is a defining match. Frame it as a moment that could change the season.',
  momentum: 'This streak tells a story. What changed? What happens next?',
};

export function buildPrompt(story: ScoredStory): { system: string; user: string } {
  const context = buildContext(story);
  const typeInstruction = TYPE_INSTRUCTIONS[story.type] || '';

  return {
    system: SYSTEM_PROMPT,
    user: `${context}\n${typeInstruction}\n\nWrite 2-3 social media post variations for this story.`,
  };
}
