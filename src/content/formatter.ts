export interface StructuredContent {
  /** Default post candidate. Always shown. */
  main: string;
  /** Supporting alternative — analytical/numbers-first. */
  data: string;
  /** Supporting alternative — sharpest possible take. Omitted if weak. */
  edge: string | null;
}

// ── Data layer types (stored in DB) ─────────────────────────────────

/** Atomic content unit — one tweet-sized text with associated hashtags */
export interface ContentPiece {
  mainText: string;
  hashtags: string[];
}

/** A labeled single-post option */
export interface PostCandidate extends ContentPiece {
  label: 'main' | 'data' | 'edge';
}

/** Thread: ordered sequence of tweets (Feature B, null until then) */
export interface ThreadCandidate {
  tweets: ContentPiece[];
}

/** Shared metadata across all content for a story */
export interface ContentMetadata {
  hashtags: string[];
  probability?: {
    before?: number | null;
    after?: number | null;
    deltaPp?: number | null;
    source?: string | null;
  };
}

export type ContentMode = 'short_post' | 'thread';

/** The stored content envelope */
export interface EnrichedContent {
  contentMode: ContentMode;
  posts: PostCandidate[];
  thread: ThreadCandidate | null;
  raw: StructuredContent;
  metadata: ContentMetadata;
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

// ── HTML escape helper (used by delivery layer) ─────────────────────────

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
