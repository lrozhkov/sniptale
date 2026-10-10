import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type {
  ReviewOriginalSpeechReplacement,
  ReviewOriginalSpeechTranscript,
  ReviewOriginalSpeech,
} from './speech-transcript';
import { parseReviewSpeechReplacement, parseReviewSpeechTranscript } from './speech-validation';

export type {
  ReviewOriginalSpeechReplacement,
  ReviewOriginalSpeechTranscript,
  ReviewOriginalSpeech,
} from './speech-transcript';

function parseOriginalReplacement(value: unknown): ReviewOriginalSpeechReplacement | null {
  const replacement = parseReviewSpeechReplacement(value);
  if (
    !replacement ||
    !isRecord(value) ||
    (value['enabled'] !== undefined && typeof value['enabled'] !== 'boolean') ||
    typeof value['originalVolume'] !== 'number' ||
    !Number.isFinite(value['originalVolume']) ||
    value['originalVolume'] < 0 ||
    value['originalVolume'] > 1
  )
    return null;
  return {
    ...replacement,
    enabled: value['enabled'] ?? true,
    originalVolume: value['originalVolume'],
  };
}

/** Reuses the strict transcript envelope while retaining original-only replacement semantics. */
export function parseReviewOriginalSpeechTranscript(
  value: unknown
): ReviewOriginalSpeechTranscript | null {
  return parseReviewSpeechTranscript(value, parseOriginalReplacement);
}

/** Older omission is handled by the containing audio codec; explicit malformed state is rejected. */
export function parseReviewOriginalSpeech(value: unknown): ReviewOriginalSpeech | null {
  if (!isRecord(value) || typeof value['enabled'] !== 'boolean') return null;
  const transcript = parseReviewOriginalSpeechTranscript(value['transcript']);
  return transcript ? { enabled: value['enabled'], transcript } : null;
}
