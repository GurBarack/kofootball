import RssParser from 'rss-parser';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { FEEDS } from './sources.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface NewsItem {
  source: string;
  title: string;
  description?: string;
  url: string;
  publishedAt?: string;
}

// ── Fetcher ──────────────────────────────────────────────────────────────

const parser = new RssParser({
  timeout: config.news.fetchTimeoutMs,
  headers: { 'User-Agent': 'kofootball/0.1 (RSS reader)' },
});

export async function fetchAllNews(): Promise<NewsItem[]> {
  const maxAge = config.news.maxArticleAgeHours * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAge;
  const seen = new Set<string>();
  const items: NewsItem[] = [];

  const results = await Promise.allSettled(
    FEEDS.map(async feed => {
      const parsed = await parser.parseURL(feed.url);
      return { feed, parsed };
    }),
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      logger.warn({ err: result.reason }, 'RSS feed fetch failed');
      continue;
    }

    const { feed, parsed } = result.value;

    for (const entry of parsed.items ?? []) {
      const url = entry.link ?? '';
      if (!url || seen.has(url)) continue;
      seen.add(url);

      // Filter by age if date is available
      const pubDate = entry.isoDate ?? entry.pubDate;
      if (pubDate) {
        const ts = new Date(pubDate).getTime();
        if (!isNaN(ts) && ts < cutoff) continue;
      }

      items.push({
        source: feed.name,
        title: entry.title ?? '',
        description: entry.contentSnippet ?? entry.content ?? undefined,
        url,
        publishedAt: pubDate ?? undefined,
      });
    }
  }

  return items;
}

/** Count how many feeds succeeded (for diagnostics) */
export async function fetchNewsWithStats(): Promise<{
  items: NewsItem[];
  sourcesOk: number;
  sourcesTotal: number;
}> {
  const maxAge = config.news.maxArticleAgeHours * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAge;
  const seen = new Set<string>();
  const items: NewsItem[] = [];
  let sourcesOk = 0;

  const results = await Promise.allSettled(
    FEEDS.map(async feed => {
      const parsed = await parser.parseURL(feed.url);
      return { feed, parsed };
    }),
  );

  for (const result of results) {
    if (result.status === 'rejected') {
      logger.warn({ err: result.reason }, 'RSS feed fetch failed');
      continue;
    }

    sourcesOk++;
    const { feed, parsed } = result.value;

    for (const entry of parsed.items ?? []) {
      const url = entry.link ?? '';
      if (!url || seen.has(url)) continue;
      seen.add(url);

      const pubDate = entry.isoDate ?? entry.pubDate;
      if (pubDate) {
        const ts = new Date(pubDate).getTime();
        if (!isNaN(ts) && ts < cutoff) continue;
      }

      items.push({
        source: feed.name,
        title: entry.title ?? '',
        description: entry.contentSnippet ?? entry.content ?? undefined,
        url,
        publishedAt: pubDate ?? undefined,
      });
    }
  }

  return { items, sourcesOk, sourcesTotal: FEEDS.length };
}
