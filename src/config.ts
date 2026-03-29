import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  FOOTBALL_DATA_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),
});

const env = envSchema.safeParse(process.env);

// Allow running without env vars for testing/dev — will fail at runtime if accessed
const safeEnv = env.success
  ? env.data
  : {
      FOOTBALL_DATA_KEY: process.env.FOOTBALL_DATA_KEY || '',
      OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
      TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
    };

export const config = {
  footballData: {
    key: safeEnv.FOOTBALL_DATA_KEY,
    baseUrl: 'https://api.football-data.org/v4',
    rateLimitPerMin: 10,
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
  minScoreThreshold: 50,
  leagueCooldownHours: 12,

  selection: {
    teamCooldownHours: 6,
    teamCooldownPenalty: 15,
    narrativeCooldownHours: 12,
    narrativeOverlapThreshold: 0.5,
    compositeWeightScore: 0.5,
    compositeWeightNarrative: 0.5,
  },

  news: {
    enabled: true,
    maxArticleAgeHours: 12,
    fetchTimeoutMs: 5000,
    buzzScoreCap: 20,
    buzzBoostMax: 15,
    signalBoostMax: 10,
    signalOverrideMinStrength: 2,
    signalOverrideMinDistinct: 2,
    threadSignalMinDistinct: 2,
    threadSignalMinStrength: 3,
  },

  threads: {
    maxPerDay: 1,
    minTweets: 4,
    maxTweets: 8,
    maxTweetChars: 280,
    openingMaxChars: 260,
    forceThread: process.env.FORCE_THREAD === 'true',
  },

  // Supported leagues (full catalog — enabledLeagues controls which are active)
  leagues: {
    39: 'Premier League',
    140: 'La Liga',
    135: 'Serie A',
    78: 'Bundesliga',
    2: 'Champions League',
  } as Record<number, string>,

  // Maps internal numeric league IDs → Football-Data.org competition codes
  leagueCodeMap: {
    39: 'PL',
    140: 'PD',
    135: 'SA',
    78: 'BL1',
    2: 'CL',
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
} as const;

export type StoryType = (typeof config.enabledStoryTypes)[number];
