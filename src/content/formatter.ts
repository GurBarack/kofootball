import { config } from '../config.js';
import type { ScoredStory } from '../detection/detector.js';

export interface StructuredContent {
  /** Default post candidate. Always shown. */
  main: string;
  /** Supporting alternative — analytical/numbers-first. */
  data: string;
  /** Supporting alternative — sharpest possible take. Omitted if weak. */
  edge: string | null;
}

// ── Publishing logic ────────────────────────────────────────────────────
// MAIN  = the post. This is what gets published if approved.
// DATA  = supporting alternative. Reviewer can swap it in.
// EDGE  = optional sharpest take. Only shown if it passes quality gate.

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

  const main = sections['main'] || '';
  const data = sections['data'] || '';
  const rawEdge = sections['edge'] || '';
  const edge = isEdgeWorthShowing(rawEdge, main) ? rawEdge : null;

  return { main, data, edge };
}

/**
 * Guardrail: omit EDGE if it's weak, repetitive, or doesn't add sharpness.
 */
function isEdgeWorthShowing(edge: string, main: string): boolean {
  if (!edge || edge.length < 15) return false;

  // Too long — edge should be a single punchy line
  if (edge.length > 200) return false;

  // Check overlap: if >60% of edge words appear in main, it's repetitive
  const edgeWords = new Set(edge.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/));
  const mainWords = new Set(main.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/));
  let overlap = 0;
  for (const w of edgeWords) {
    if (mainWords.has(w)) overlap++;
  }
  const overlapRatio = overlap / edgeWords.size;
  if (overlapRatio > 0.6) return false;

  return true;
}

// ── Plain text format (for demo/logging) ────────────────────────────────

export function formatForTelegram(story: ScoredStory, content: StructuredContent): string {
  const leagueName = config.leagues[story.league_id] || `League ${story.league_id}`;
  const typeLabel = story.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const payload = story.payload as Record<string, unknown>;

  let msg = '';

  // Header
  msg += `\uD83C\uDFC6 ${leagueName.toUpperCase()} | ${typeLabel} | Score: ${story.score}\n`;
  msg += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n`;

  // Main take — the post candidate
  msg += `\u25B6\uFE0F POST CANDIDATE:\n`;
  msg += `${content.main}\n\n`;

  // Alternatives — supporting, not equal
  msg += `\u2500\u2500\u2500 alternatives \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n`;
  msg += `\uD83D\uDCC8 Data angle:\n${content.data}\n\n`;

  if (content.edge) {
    msg += `\uD83D\uDD25 Edge:\n${content.edge}\n\n`;
  }

  // Data footer
  msg += `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n`;
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

// ── HTML format (for Telegram delivery) ─────────────────────────────────

export function formatForTelegramHtml(story: ScoredStory, content: StructuredContent): string {
  const leagueName = config.leagues[story.league_id] || `League ${story.league_id}`;
  const typeLabel = story.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const payload = story.payload as Record<string, unknown>;

  let msg = '';
  msg += `\uD83C\uDFC6 <b>${esc(leagueName.toUpperCase())}</b> | ${esc(typeLabel)} | Score: ${story.score}\n\n`;

  // Main take — bold, visually dominant
  msg += `\u25B6\uFE0F <b>POST CANDIDATE</b>\n`;
  msg += `<b>${esc(content.main)}</b>\n\n`;

  // Alternatives — lighter weight
  msg += `\u2500\u2500\u2500 <i>alternatives</i> \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n`;
  msg += `\uD83D\uDCC8 <i>Data angle:</i>\n${esc(content.data)}\n\n`;

  if (content.edge) {
    msg += `\uD83D\uDD25 <i>Edge:</i>\n${esc(content.edge)}\n\n`;
  }

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
