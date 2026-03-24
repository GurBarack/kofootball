export interface TelegramInlineButton {
  text: string;
  callback_data: string;
}

export interface StoryPreview {
  id?: number;
  type: string;
  league: string;
  headline: string;
  score: number;
  variants: string[];
  reasoning?: string;
}
