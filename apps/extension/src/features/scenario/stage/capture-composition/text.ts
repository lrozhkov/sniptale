import type { CaptureCompositionKind } from './types';

const MAX_CALLOUT_LENGTH: Record<CaptureCompositionKind, number> = {
  'click-sequence': 82,
  'full-screen-context': 0,
  'side-note-walkthrough': 112,
  'sparse-viewport': 96,
  'target-focused': 82,
};

export function createCaptureCalloutText(
  body: string,
  kind: CaptureCompositionKind
): string | null {
  const normalized = body.trim().replace(/\s+/g, ' ');
  const maxLength = MAX_CALLOUT_LENGTH[kind];
  if (!normalized || maxLength <= 0) {
    return null;
  }

  return compactText(normalized, maxLength);
}

function compactText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const sentenceEnd = text.slice(0, maxLength).search(/[.!?](?:\s|$)/);
  if (sentenceEnd >= 24) {
    return text.slice(0, sentenceEnd + 1);
  }

  const lastSpace = text.lastIndexOf(' ', maxLength - 3);
  const end = lastSpace >= 24 ? lastSpace : maxLength - 3;
  return `${text.slice(0, end).trimEnd()}...`;
}
