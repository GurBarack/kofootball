/**
 * Test script: sends a mock story preview to Telegram.
 * Usage: npm run test:telegram
 *
 * Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env
 */
import 'dotenv/config';
import { sendTextMessage, sendStoryPreview } from '../src/delivery/telegram.js';
import type { StoryPreview } from '../src/delivery/types.js';

async function main() {
  console.log('--- KO Football: Telegram delivery test ---\n');

  // 1. Simple text message
  console.log('Sending plain text message...');
  const textId = await sendTextMessage(
    '\uD83D\uDD27 <b>KO Football</b> — Telegram integration test.\nIf you see this, delivery works.'
  );
  console.log(`Sent text message (id: ${textId})\n`);

  // 2. Title race story preview
  const titleRace: StoryPreview = {
    id: 1001,
    type: 'title_race',
    league: 'Premier League',
    headline: 'Arsenal (76pts) vs Man City (74pts) vs Liverpool (72pts) \u2014 4pt gap, 6 games left',
    score: 78,
    variants: [
      'Arsenal lead by 4 points but Man City won\'t blink. Six games. Two points. One of them is going to crack and it won\'t be pretty.',
      'Everyone\'s talking about Arsenal\'s "comfortable" lead. 4 points with 6 games left isn\'t comfortable. Ask anyone who watched 2012.',
      'Man City dropped points last week and the gap is still just 4. Arsenal aren\'t running away with this. They\'re stumbling toward the finish line.',
    ],
    reasoning: 'Tight 3-way race, late season, all three in strong form. High engagement potential.',
  };

  console.log('Sending title race preview...');
  const titleId = await sendStoryPreview(titleRace);
  console.log(`Sent title race (id: ${titleId})\n`);

  // 3. Relegation story preview
  const relegation: StoryPreview = {
    id: 1002,
    type: 'relegation',
    league: 'Premier League',
    headline: 'Relegation battle: 6 teams within 5pts of the drop',
    score: 54,
    variants: [
      'Six teams. Five points. Three go down. The bottom of the Premier League right now is a horror movie where nobody can find the exit.',
      'Southampton are sinking. Luton look finished. But Leicester and Bournemouth aren\'t safe either \u2014 one bad week and they\'re in the coffin.',
    ],
    reasoning: '6 teams in danger zone, tight points gap, 6 games left.',
  };

  console.log('Sending relegation preview...');
  const relId = await sendStoryPreview(relegation);
  console.log(`Sent relegation (id: ${relId})\n`);

  // 4. Momentum story preview
  const momentum: StoryPreview = {
    id: 1003,
    type: 'momentum',
    league: 'Premier League',
    headline: 'Luton in freefall: 5 losses in last 5 (rank #20)',
    score: 46,
    variants: [
      'Luton: LLLLL. Read that again. That\'s not a blip. That\'s a team that forgot how to win.',
      'Five games. Zero wins. Luton are watching the season collapse in slow motion and nothing they try is working.',
    ],
  };

  console.log('Sending momentum preview...');
  const momId = await sendStoryPreview(momentum);
  console.log(`Sent momentum (id: ${momId})\n`);

  console.log('--- All messages sent. Check Telegram. ---');
}

main().catch(err => {
  console.error('Failed:', err.response?.data || err.message);
  process.exit(1);
});
