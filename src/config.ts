import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  API_FOOTBALL_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),
});

const env = envSchema.safeParse(process.env);

// Allow running without env vars for testing/dev — will fail at runtime if accessed
const safeEnv = env.success
  ? env.data
  : {
      API_FOOTBALL_KEY: process.env.API_FOOTBALL_KEY || '',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
      TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
    };

export const config = {
  apiFootball: {
    key: safeEnv.API_FOOTBALL_KEY,
    baseUrl: 'https://v3.football.api-sports.io',
    dailyLimit: 100,
  },

  openai: {
    apiKey: safeEnv.OPENAI_API_KEY,
    model: 'gpt-4o-mini',
  },

  telegram: {
    botToken: safeEnv.TELEGRAM_BOT_TOKEN,
    chatId: safeEnv.TELEGRAM_CHAT_ID,
  },

  schedule: {
    timezone: 'Asia/Jerusalem',
    baselineRunTime: '10:00',
    activeRunTimes: ['16:30', '19:30', '22:00', '00:30'],
    runOnlyIfMatchesExist: true,
    matchLookaheadHours: 12,
  },

  // Control layer
  enabledStoryTypes: ['title_race', 'relegation', 'momentum', 'qualification', 'critical_fixture'] as const,
  enabledLeagues: [39, 140] as const, // PL + La Liga
  maxStoriesPerRun: 5,
  leagueCooldownHours: 12,

  // Supported leagues (full catalog — enabledLeagues controls which are active)
  leagues: {
    39: 'Premier League',
    140: 'La Liga',
    135: 'Serie A',
    78: 'Bundesliga',
    2: 'Champions League',
    3: 'Europa League',
  } as Record<number, string>,

  // Content tone — injected into every LLM prompt
  tone: {
    system: [
      'You are a sharp football insider, not a journalist.',
      'Short sentences. High punch. No filler.',
      'Take a side. Be slightly provocative.',
      'Never use clichés like "it\'s all to play for" or "crunch time" or "must-win".',
      'Sound like a fan who has watched every game this season.',
    ],
  },

  db: {
    path: './data/kofootball.db',
  },

  season: 2025,
} as const;

export type StoryType = (typeof config.enabledStoryTypes)[number];
