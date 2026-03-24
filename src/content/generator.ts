import OpenAI from 'openai';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { buildPrompt } from './prompts.js';
import { parseVariants, type StructuredContent } from './formatter.js';
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
