import { config } from '../config.js';
import type { StoryBrief } from '../brief/brief-builder.js';

const TONE_BLOCK = config.tone.system.map(line => `- ${line}`).join('\n');

const THREAD_SYSTEM_PROMPT = `You write football thread content for social media. You're the friend in the group chat who actually watches every game and sees things others miss.

TONE:
${TONE_BLOCK}

OUTPUT FORMAT — write a thread of 4-8 tweets. Label each one:

TWEET 1:
[Opening hook. Must grab attention. Keep under 260 characters. Include one hard fact.]

TWEET 2:
[Context — what's happening in the table. Use numbers.]

TWEET 3:
[The key tension or turning point. What most people are missing.]

...continue as needed (4-8 tweets total)...

TWEET N:
[Closing take or prediction. Make it land.]

RULES:
- Every tweet must be under 280 characters
- At least 3 tweets must include a concrete stat (points, gap, form, games left)
- No two tweets should make the same point
- No hashtags, no emojis (except 🧵 is allowed in tweet 1 only)
- Never use: "it's all to play for", "crunch time", "must-win", "drama", "scenes", "huge", "massive"
- Build a narrative arc — don't just list facts
- Each tweet should make the reader want to read the next one
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
  title_race: 'Tell the story of this title race. Who looks like winners? Who is bottling it? Build tension across the thread.',
  relegation: 'Tell the story of this relegation battle. Who is already gone? Who has a lifeline? Make the reader feel the stakes.',
  qualification: 'European spots change clubs. Walk through who earned it and who is fading. Use the form to build the case.',
  critical_fixture: 'This fixture decides something. Build the context, then reveal what\'s really at stake for each side.',
  momentum: 'This form run means something. Connect it to where they sit in the table. What happens if this continues?',
};

export function buildThreadPrompt(brief: StoryBrief): { system: string; user: string } {
  const context = buildContextFromBrief(brief);
  const typeInstruction = TYPE_INSTRUCTIONS[brief.storyType] || '';

  return {
    system: THREAD_SYSTEM_PROMPT,
    user: `${context}\n\nWrite a thread (4-8 tweets). ${typeInstruction}`,
  };
}
