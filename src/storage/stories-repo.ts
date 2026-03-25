import { getDb } from './db.js';
import type { EnrichedContent } from '../content/formatter.js';

export interface StoryRow {
  id: number;
  type: string;
  league_id: number;
  headline: string;
  score: number;
  payload_json: string;
  content_variants: string | null;
  media_suggestion: string;
  status: string;
  feedback: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface NewStory {
  type: string;
  league_id: number;
  headline: string;
  score: number;
  payload_json: string;
  content_variants?: string;
  media_suggestion?: string;
}

export function insertStory(story: NewStory): number {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO stories (type, league_id, headline, score, payload_json, content_variants, media_suggestion)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    story.type, story.league_id, story.headline, story.score,
    story.payload_json, story.content_variants || null,
    story.media_suggestion || 'text_only'
  );
  return Number(result.lastInsertRowid);
}

export function updateStoryContent(id: number, enriched: EnrichedContent): void {
  const db = getDb();
  db.prepare(`UPDATE stories SET content_variants = ? WHERE id = ?`)
    .run(JSON.stringify(enriched), id);
}

/** Parse stored content — handles both old string[] format and new EnrichedContent */
export function parseStoredContent(row: StoryRow): EnrichedContent | null {
  if (!row.content_variants) return null;
  const parsed = JSON.parse(row.content_variants);

  // Old format: string[] (backward compat)
  if (Array.isArray(parsed)) {
    const [main, data, edge] = parsed as string[];
    return {
      contentMode: 'short_post',
      posts: [
        { label: 'main', mainText: main || '', hashtags: [] },
        { label: 'data', mainText: data || '', hashtags: [] },
        ...(edge ? [{ label: 'edge' as const, mainText: edge, hashtags: [] }] : []),
      ],
      thread: null,
      raw: { main: main || '', data: data || '', edge: edge || null },
      metadata: { hashtags: [] },
    };
  }

  return parsed as EnrichedContent;
}

export function getLastStoryForLeague(leagueId: number): StoryRow | undefined {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM stories
    WHERE league_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(leagueId) as StoryRow | undefined;
}

export function getRecentStories(hours = 24): StoryRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM stories
    WHERE created_at > datetime('now', ? || ' hours')
    ORDER BY score DESC
  `).all(`-${hours}`) as StoryRow[];
}
