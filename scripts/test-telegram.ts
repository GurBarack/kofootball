/**
 * Test script: sends a mock story preview to Telegram using split delivery.
 * Usage: npm run test:telegram
 *
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env
 */
import 'dotenv/config';
import { sendHtmlMessage, sendStoryMessages } from '../src/delivery/telegram.js';
import { formatForX, buildPostCandidates } from '../src/content/post-builder.js';
import type { StructuredContent } from '../src/content/formatter.js';

async function main() {
  console.log('--- KO Football: Telegram delivery test ---\n');

  // 1. Simple text message
  console.log('Sending plain text message...');
  const textId = await sendHtmlMessage(
    '\uD83D\uDD27 <b>KO Football</b> — Telegram integration test.\nIf you see this, delivery works.'
  );
  console.log(`Sent text message (id: ${textId})\n`);

  // 2. Title race story — split delivery
  const content: StructuredContent = {
    main: 'Arsenal lead by 4 points but Man City won\'t blink. Six games. Two points. One of them is going to crack.',
    data: '76, 74, 72. Three teams within four points with six to play. Tightest finish since 2014.',
    edge: 'Arsenal are first and still playing like they\'re chasing.',
  };
  const hashtags = ['#PremierLeague', '#Arsenal', '#ManCity', '#TitleRace'];
  const candidates = buildPostCandidates(content, hashtags);
  const formatted = formatForX(candidates);

  console.log('Sending title race (split delivery)...');
  const msgIds = await sendStoryMessages({
    storyId: 1001,
    type: 'title_race',
    league: 'Premier League',
    headline: 'Arsenal (76pts) vs Man City (74pts) vs Liverpool (72pts) \u2014 4pt gap, 6 games left',
    score: 78,
    candidates: formatted,
    dataSummary: 'Arsenal 76pts \u00B7 Man City 74pts \u00B7 Liverpool 72pts\n6 games left \u00B7 4pt gap',
    reasoning: 'Tight 3-way race, late season, all three in strong form.',
  });
  console.log(`Sent ${msgIds.length} messages (ids: ${msgIds.join(', ')})\n`);

  console.log('--- All messages sent. Check Telegram. ---');
}

main().catch(err => {
  console.error('Failed:', err.response?.data || err.message);
  process.exit(1);
});
