import { config } from '../config.js';
import { http } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { escapeHtml } from '../content/formatter.js';
import type { StoryDeliveryPayload, TelegramInlineButton } from './types.js';

const BASE_URL = `https://api.telegram.org/bot${config.telegram.botToken}`;
const INTER_MESSAGE_DELAY_MS = 300;

// ── Low-level send ──────────────────────────────────────────────────────

export async function sendHtmlMessage(text: string): Promise<number> {
  const res = await http.post(`${BASE_URL}/sendMessage`, {
    chat_id: config.telegram.chatId,
    text,
    parse_mode: 'HTML',
  });
  const messageId = res.data?.result?.message_id;
  logger.info({ messageId }, 'HTML message sent');
  return messageId;
}

export async function sendPlainMessage(text: string): Promise<number> {
  const res = await http.post(`${BASE_URL}/sendMessage`, {
    chat_id: config.telegram.chatId,
    text,
  });
  const messageId = res.data?.result?.message_id;
  logger.info({ messageId }, 'Plain message sent');
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

// ── Thread preview ─────────────────────────────────────────────────────

export async function sendThreadPreview(
  storyId: number,
  tweets: { mainText: string }[],
  hashtags: string[],
): Promise<number[]> {
  const messageIds: number[] = [];
  const total = tweets.length;

  // Compose all tweets into a single plain-text message
  const lines: string[] = [`\uD83E\uDDF5 THREAD PREVIEW (${total} tweets)\n`];

  for (let i = 0; i < tweets.length; i++) {
    const prefix = i === 0 ? `1/${total} \uD83E\uDDF5 ` : `${i + 1}/${total} `;
    lines.push(`${prefix}${tweets[i].mainText}`);
    if (i < tweets.length - 1) lines.push('\u2193');
  }

  // Hashtags on last line
  if (hashtags.length > 0) {
    lines.push(`\n${hashtags.join(' ')}`);
  }

  const previewId = await sendPlainMessage(lines.join('\n'));
  messageIds.push(previewId);

  await delay(INTER_MESSAGE_DELAY_MS);

  // Overview message with approve/reject buttons
  const overviewText = `<b>\uD83E\uDDF5 Thread</b> | <code>#ID-${storyId}</code> | ${total} tweets`;
  const buttons = [[
    { text: '\u2705 Approve Thread', callback_data: `approve:${storyId}` },
    { text: '\u274C Reject', callback_data: `reject:${storyId}` },
    { text: '\u270F\uFE0F Improve', callback_data: `improve:${storyId}` },
  ]];
  const overviewId = await sendMessageWithButtons(overviewText, buttons);
  messageIds.push(overviewId);

  logger.info({ storyId, tweetCount: total, messageCount: messageIds.length }, 'Thread preview sent');
  return messageIds;
}

// ── Story delivery ──────────────────────────────────────────────────────

const LABEL_DISPLAY: Record<string, string> = {
  main: 'MAIN POST',
  data: 'DATA POST',
  edge: 'EDGE POST',
};

function buildOverviewMessage(payload: StoryDeliveryPayload): string {
  const typeLabel = payload.type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  let msg = '';
  msg += `\uD83C\uDFC6 <b>${escapeHtml(payload.league.toUpperCase())}</b>`;
  msg += ` | ${escapeHtml(typeLabel)}`;
  msg += ` | Score: ${payload.score}`;
  msg += ` | <code>#ID-${payload.storyId}</code>\n\n`;

  if (payload.dataSummary) {
    msg += `${escapeHtml(payload.dataSummary)}\n\n`;
  }

  msg += `\uD83D\uDCCA ${escapeHtml(payload.headline)}`;

  if (payload.reasoning) {
    msg += `\n\n\uD83D\uDCDD <i>${escapeHtml(payload.reasoning)}</i>`;
  }

  return msg.trim();
}

function buildStoryButtons(storyId: number): TelegramInlineButton[][] {
  return [[
    { text: '\u2705 Approve', callback_data: `approve:${storyId}` },
    { text: '\u274C Reject', callback_data: `reject:${storyId}` },
    { text: '\u270F\uFE0F Improve', callback_data: `improve:${storyId}` },
  ]];
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function sendStoryMessages(
  payload: StoryDeliveryPayload,
): Promise<number[]> {
  const messageIds: number[] = [];

  logger.info(
    { type: payload.type, score: payload.score, storyId: payload.storyId },
    'Sending story messages',
  );

  // Message 1: Overview with buttons
  const overviewText = buildOverviewMessage(payload);
  const buttons = buildStoryButtons(payload.storyId);
  const overviewId = await sendMessageWithButtons(overviewText, buttons);
  messageIds.push(overviewId);

  // Messages 2-4: Post options (plain text, copy-friendly)
  for (const candidate of payload.candidates) {
    if (!candidate.passesQualityGate) continue;

    await delay(INTER_MESSAGE_DELAY_MS);

    const label = LABEL_DISPLAY[candidate.label] || candidate.label.toUpperCase();
    const postText = `${label}\n\n${candidate.fullPostText}`;
    const msgId = await sendPlainMessage(postText);
    messageIds.push(msgId);
  }

  logger.info(
    { storyId: payload.storyId, messageCount: messageIds.length },
    'Story messages sent',
  );

  return messageIds;
}
