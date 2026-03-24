import { config } from '../config.js';
import { http } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import type { StoryPreview, TelegramInlineButton } from './types.js';

const BASE_URL = `https://api.telegram.org/bot${config.telegram.botToken}`;

// ── Low-level send ──────────────────────────────────────────────────────

export async function sendTextMessage(text: string): Promise<number> {
  const res = await http.post(`${BASE_URL}/sendMessage`, {
    chat_id: config.telegram.chatId,
    text,
    parse_mode: 'HTML',
  });
  const messageId = res.data?.result?.message_id;
  logger.info({ messageId }, 'Text message sent');
  return messageId;
}

export async function sendMessageWithButtons(
  text: string,
  buttons: TelegramInlineButton[][],
): Promise<number> {
  const res = await http.post(`${BASE_URL}/sendMessage`, {
    chat_id: config.telegram.chatId,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons },
  });
  const messageId = res.data?.result?.message_id;
  logger.info({ messageId }, 'Message with buttons sent');
  return messageId;
}

// ── Story preview ───────────────────────────────────────────────────────

function buildStoryButtons(storyId: number | string): TelegramInlineButton[][] {
  return [[
    { text: '\u2705 Approve', callback_data: `approve:${storyId}` },
    { text: '\u274C Reject', callback_data: `reject:${storyId}` },
    { text: '\u270F\uFE0F Improve', callback_data: `improve:${storyId}` },
  ]];
}

function formatStoryPreview(story: StoryPreview): string {
  const typeLabel = story.type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  let msg = '';
  msg += `\uD83C\uDFC6 <b>${story.league.toUpperCase()}</b> | ${typeLabel} | Score: ${story.score}\n\n`;
  msg += `\uD83D\uDCCA ${escapeHtml(story.headline)}\n\n`;

  story.variants.forEach((v, i) => {
    msg += `\uD83D\uDCAC <b>Variant ${i + 1}:</b>\n${escapeHtml(v)}\n\n`;
  });

  if (story.reasoning) {
    msg += `\uD83D\uDCDD <i>${escapeHtml(story.reasoning)}</i>\n`;
  }

  return msg.trim();
}

export async function sendStoryPreview(story: StoryPreview): Promise<number> {
  const text = formatStoryPreview(story);
  const storyId = story.id ?? Date.now();
  const buttons = buildStoryButtons(storyId);

  logger.info({ type: story.type, score: story.score, storyId }, 'Sending story preview');
  return sendMessageWithButtons(text, buttons);
}

// ── Utility ─────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
