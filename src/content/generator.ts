import OpenAI from 'openai';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { buildPrompt } from './prompts.js';
import { buildThreadPrompt } from './thread-prompt.js';
import { parseVariants, parseThread, type StructuredContent, type ContentPiece } from './formatter.js';
import type { StoryBrief } from '../brief/brief-builder.js';

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return _client;
}

export async function generateContent(brief: StoryBrief): Promise<StructuredContent> {
  const { system, user } = buildPrompt(brief);

  logger.info({ type: brief.storyType, headline: brief.headline }, 'Generating content');

  const client = getClient();
  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.9,
    max_tokens: 500,
  });

  const raw = response.choices[0]?.message?.content || '';
  const content = parseVariants(raw);

  logger.info(
    { hasMain: !!content.main, hasData: !!content.data, hasEdge: !!content.edge },
    'Content generated',
  );
  return content;
}

export async function generateThread(brief: StoryBrief): Promise<ContentPiece[] | null> {
  const { system, user } = buildThreadPrompt(brief);

  logger.info({ type: brief.storyType, headline: brief.headline }, 'Generating thread');

  const client = getClient();
  const response = await client.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.85,
    max_tokens: 1200,
  });

  const raw = response.choices[0]?.message?.content || '';
  const tweets = parseThread(raw);

  if (tweets.length === 0) {
    logger.warn('Thread generation returned no tweets');
    return null;
  }

  logger.info({ tweetCount: tweets.length }, 'Thread generated');
  return tweets;
}
