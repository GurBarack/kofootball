import type { StructuredContent, PostCandidate } from './formatter.js';

// ── Presentation layer types (computed at delivery, never stored) ────────

export interface FormattedPost {
  label: 'main' | 'data' | 'edge';
  mainText: string;
  hashtags: string[];
  fullPostText: string;
  charCount: number;
  passesQualityGate: boolean;
}

const X_POST_CHAR_TARGET = 270; // 10-char buffer under X's 280 limit

// ── Data layer: build PostCandidates from LLM output ────────────────────

export function buildPostCandidates(
  content: StructuredContent,
  hashtags: string[],
): PostCandidate[] {
  const candidates: PostCandidate[] = [];

  candidates.push({ label: 'main', mainText: content.main, hashtags });
  candidates.push({ label: 'data', mainText: content.data, hashtags });

  if (content.edge) {
    candidates.push({ label: 'edge', mainText: content.edge, hashtags });
  }

  return candidates;
}

// ── Presentation layer: format for X ────────────────────────────────────

function composeFullText(mainText: string, hashtags: string[]): string {
  if (hashtags.length === 0) return mainText;
  return `${mainText}\n\n${hashtags.join(' ')}`;
}

export function formatForTelegram(candidates: PostCandidate[]): FormattedPost[] {
  return candidates.map(candidate => {
    const fullPostText = composeFullText(candidate.mainText, candidate.hashtags);
    return {
      label: candidate.label,
      mainText: candidate.mainText,
      hashtags: [...candidate.hashtags],
      fullPostText,
      charCount: fullPostText.length,
      passesQualityGate: true,
    };
  });
}

export function formatForX(candidates: PostCandidate[]): FormattedPost[] {
  return candidates.map(candidate => {
    let hashtags = [...candidate.hashtags];
    let fullPostText = composeFullText(candidate.mainText, hashtags);

    // Trim hashtags from end until under target
    while (fullPostText.length > X_POST_CHAR_TARGET && hashtags.length > 0) {
      hashtags.pop();
      fullPostText = composeFullText(candidate.mainText, hashtags);
    }

    const passesQualityGate = fullPostText.length <= X_POST_CHAR_TARGET;

    return {
      label: candidate.label,
      mainText: candidate.mainText,
      hashtags,
      fullPostText,
      charCount: fullPostText.length,
      passesQualityGate,
    };
  });
}
