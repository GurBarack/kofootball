import { config } from '../config.js';
import type { ScoredStory } from '../detection/detector.js';

export interface StructuredContent {
  main: string;
  data: string;
  edge: string;
}

/**
 * Parse LLM output into structured sections.
 * Expects MAIN: / DATA: / EDGE: labels.
 */
export function parseVariants(raw: string): StructuredContent {
  const sections: Record<string, string> = {};
  let currentKey = '';

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (/^MAIN:/i.test(trimmed)) {
      currentKey = 'main';
      const rest = trimmed.replace(/^MAIN:\s*/i, '');
      if (rest) sections[currentKey] = rest;
    } else if (/^DATA:/i.test(trimmed)) {
      currentKey = 'data';
      const rest = trimmed.replace(/^DATA:\s*/i, '');
      if (rest) sections[currentKey] = rest;
    } else if (/^EDGE:/i.test(trimmed)) {
      currentKey = 'edge';
      const rest = trimmed.replace(/^EDGE:\s*/i, '');
      if (rest) sections[currentKey] = rest;
    } else if (currentKey && trimmed) {
      sections[currentKey] = sections[currentKey]
        ? `${sections[currentKey]} ${trimmed}`
        : trimmed;
    }
  }

  return {
    main: sections['main'] || '',
    data: sections['data'] || '',
    edge: sections['edge'] || '',
  };
}

export function formatForTelegram(story: ScoredStory, content: StructuredContent): string {
  const leagueName = config.leagues[story.league_id] || `League ${story.league_id}`;
  const typeLabel = story.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const payload = story.payload as Record<string, unknown>;
  let msg = '';

  // Header
  msg += `\uD83C\uDFC6 ${leagueName.toUpperCase()} | ${typeLabel} | Score: ${story.score}\n`;
  msg += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n`;

  // Main take — stands out
  msg += `\u25B6\uFE0F MAIN TAKE:\n`;
  msg += `${content.main}\n\n`;

  // Alternative angles — compact
  msg += `\uD83D\uDCC8 Data angle:\n${content.data}\n\n`;
  msg += `\uD83D\uDD25 Edge:\n${content.edge}\n\n`;

  // Data footer
  msg += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
  const teams = payload.teams as Array<Record<string, unknown>> | undefined;
  if (teams) {
    const summary = teams.map(t => `${t.name} ${t.points}pts`).join(' \u00B7 ');
    msg += `${summary}\n`;
  }
  if (payload.gamesLeft !== undefined) {
    msg += `${payload.gamesLeft} games left`;
    if (payload.pointGap !== undefined) msg += ` \u00B7 ${payload.pointGap}pt gap`;
    msg += '\n';
  }

  return msg.trim();
}

/** Format for Telegram HTML (used by delivery module) */
export function formatForTelegramHtml(story: ScoredStory, content: StructuredContent): string {
  const leagueName = config.leagues[story.league_id] || `League ${story.league_id}`;
  const typeLabel = story.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const payload = story.payload as Record<string, unknown>;

  let msg = '';
  msg += `\uD83C\uDFC6 <b>${esc(leagueName.toUpperCase())}</b> | ${esc(typeLabel)} | Score: ${story.score}\n\n`;

  // Main take — bold block
  msg += `\u25B6\uFE0F <b>MAIN TAKE</b>\n`;
  msg += `<b>${esc(content.main)}</b>\n\n`;

  // Alternatives — lighter
  msg += `\uD83D\uDCC8 <i>Data angle:</i>\n${esc(content.data)}\n\n`;
  msg += `\uD83D\uDD25 <i>Edge:</i>\n${esc(content.edge)}\n\n`;

  // Data footer
  const teams = payload.teams as Array<Record<string, unknown>> | undefined;
  if (teams) {
    const summary = teams.map(t => `${t.name} ${t.points}pts`).join(' \u00B7 ');
    msg += `<code>${esc(summary)}</code>\n`;
  }
  if (payload.gamesLeft !== undefined) {
    let footer = `${payload.gamesLeft} games left`;
    if (payload.pointGap !== undefined) footer += ` \u00B7 ${payload.pointGap}pt gap`;
    msg += `<code>${esc(footer)}</code>`;
  }

  return msg.trim();
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
