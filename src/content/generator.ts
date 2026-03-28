import OpenAI from 'openai';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { buildPrompt } from './prompts.js';
import { buildThreadPrompt } from './thread-prompt.js';
import { parseVariants, parseThread, type StructuredContent, type ContentPiece } from './formatter.js';
import type { ScoredStory } from '../detection/detector.js';

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({ apiKey: config.openai.apiKey });
  }
  return _client;
}

export async function generateContent(story: ScoredStory): Promise<StructuredContent> {
  const { system, user } = buildPrompt(story);

  logger.info({ type: story.type, headline: story.headline }, 'Generating content');

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

export async function generateThread(story: ScoredStory): Promise<ContentPiece[] | null> {
  const { system, user } = buildThreadPrompt(story);

  logger.info({ type: story.type, headline: story.headline }, 'Generating thread');

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
