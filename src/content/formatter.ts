import { config } from '../config.js';
import type { ScoredStory } from '../detection/detector.js';

export function formatForTelegram(story: ScoredStory, variants: string[]): string {
  const leagueName = config.leagues[story.league_id] || `League ${story.league_id}`;
  const typeLabel = story.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  let msg = `🏆 ${leagueName.toUpperCase()} | ${typeLabel} | Score: ${story.score}\n\n`;
  msg += `📊 ${story.headline}\n\n`;

  variants.forEach((v, i) => {
    msg += `💬 Variant ${i + 1}:\n${v}\n\n`;
  });

  // Add payload context
  const payload = story.payload as Record<string, unknown>;
  const teams = payload.teams as Array<Record<string, unknown>> | undefined;
  if (teams) {
    const summary = teams.map(t => `${t.name} (${t.points}pts)`).join(' · ');
    msg += `📝 ${summary}\n`;
  }

  msg += `🎨 Suggested: text_only`;
  return msg;
}
