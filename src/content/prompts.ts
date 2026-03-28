import { config } from '../config.js';
import type { StoryBrief } from '../brief/brief-builder.js';

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

function buildContextFromBrief(brief: StoryBrief): string {
  let context = `Competition: ${brief.competition}\nStory type: ${brief.storyType}\n`;
  context += `Entity: ${brief.entity}\n`;
  context += `\nWhat happened: ${brief.whatHappened}\n`;
  context += `Why it matters: ${brief.whyItMatters}\n`;
  context += `\nMain angle: ${brief.mainAngle}\n`;
  context += `Tension: ${brief.tension}\n`;
  context += `Discussion hook: ${brief.discussionHook}\n`;

  if (brief.keyFacts.length > 0) {
    context += '\nKey facts:\n';
    for (const kf of brief.keyFacts) {
      context += `  - ${kf.fact}\n`;
    }
  }

  if (brief.sourceSignals.length > 0) {
    context += '\nNews context:\n';
    for (const sig of brief.sourceSignals) {
      context += `  - ${sig.team}: ${sig.articleCount} articles, buzz ${sig.buzzScore}`;
      if (sig.events.length > 0) context += ` [${sig.events.join(', ')}]`;
      context += '\n';
      for (const hl of sig.headlines) {
        context += `    "${hl}"\n`;
      }
    }
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

export function buildPrompt(brief: StoryBrief): { system: string; user: string } {
  const context = buildContextFromBrief(brief);
  const typeInstruction = TYPE_INSTRUCTIONS[brief.storyType] || '';

  return {
    system: SYSTEM_PROMPT,
    user: `${context}\n\n${typeInstruction}`,
  };
}
