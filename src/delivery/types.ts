import type { FormattedPost } from '../content/post-builder.js';

export interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

export interface StoryDeliveryPayload {
  storyId: number;
  type: string;
  league: string;
  headline: string;
  score: number;
  reasoning?: string;
  candidates: FormattedPost[];
  dataSummary: string;
}
