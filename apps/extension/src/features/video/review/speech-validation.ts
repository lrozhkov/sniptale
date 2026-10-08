import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type {
  ReviewSpeechPhrase,
  ReviewSpeechProfile,
  ReviewSpeechReplacement,
  ReviewSpeechTranscript,
  ReviewSpeechWord,
} from './speech-transcript';
import { reviewSpeechTextSignature } from './speech-transcript';

const identity = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value;
const text = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 16_000;
const time = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86_400;
const revision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Strict bounded durable profile parsing; model availability never gates historical playback. */
export function parseReviewSpeechProfile(value: unknown): ReviewSpeechProfile | null {
  if (
    !isRecord(value) ||
    !identity(value['modelId']) ||
    typeof value['voiceId'] !== 'string' ||
    !value['voiceId'].trim() ||
    value['voiceId'].length > 200 ||
    (value['responseFormat'] !== 'mp3' && value['responseFormat'] !== 'wav') ||
    (value['speed'] !== undefined &&
      (typeof value['speed'] !== 'number' ||
        !Number.isFinite(value['speed']) ||
        value['speed'] < 0.25 ||
        value['speed'] > 4)) ||
    (value['instructions'] !== undefined &&
      (typeof value['instructions'] !== 'string' || value['instructions'].length > 10_000))
  )
    return null;
  return {
    modelId: value['modelId'],
    voiceId: value['voiceId'],
    responseFormat: value['responseFormat'],
    ...(typeof value['speed'] === 'number' ? { speed: value['speed'] } : {}),
    ...(typeof value['instructions'] === 'string' ? { instructions: value['instructions'] } : {}),
  };
}

function parseWord(value: unknown): ReviewSpeechWord | null {
  if (
    !isRecord(value) ||
    !text(value['text']) ||
    !time(value['start']) ||
    !time(value['end']) ||
    value['end'] <= value['start']
  )
    return null;
  return { text: value['text'], start: value['start'], end: value['end'] };
}

function parsePhrase(value: unknown): ReviewSpeechPhrase | null {
  if (
    !isRecord(value) ||
    !identity(value['id']) ||
    !time(value['start']) ||
    !time(value['end']) ||
    value['end'] <= value['start'] ||
    !text(value['text']) ||
    !text(value['originalText']) ||
    !revision(value['revision']) ||
    (value['alignment'] !== 'word' &&
      value['alignment'] !== 'segment' &&
      value['alignment'] !== 'manual' &&
      value['alignment'] !== 'range')
  )
    return null;
  let words: ReviewSpeechWord[] | undefined;
  if (value['words'] !== undefined) {
    if (!Array.isArray(value['words']) || value['words'].length > 4_000) return null;
    words = [];
    for (const raw of value['words']) {
      const word = parseWord(raw);
      if (
        !word ||
        word.start < value['start'] ||
        word.end > value['end'] ||
        (words.length > 0 && word.start < words.at(-1)!.end)
      )
        return null;
      words.push(word);
    }
  }
  return {
    id: value['id'],
    start: value['start'],
    end: value['end'],
    text: value['text'],
    originalText: value['originalText'],
    revision: value['revision'],
    alignment: value['alignment'],
    ...(words ? { words } : {}),
  };
}

/** Parses the shared immutable replacement contract before target-specific fields. */
export function parseReviewSpeechReplacement(value: unknown): ReviewSpeechReplacement | null {
  if (
    !isRecord(value) ||
    !identity(value['id']) ||
    !identity(value['assetId']) ||
    !value['assetId'].startsWith('project-asset:') ||
    !identity(value['phraseId']) ||
    !time(value['start']) ||
    !time(value['end']) ||
    value['end'] <= value['start'] ||
    !time(value['duration']) ||
    value['duration'] <= 0 ||
    value['duration'] > value['end'] - value['start'] ||
    !revision(value['revision']) ||
    !text(value['text']) ||
    typeof value['textSignature'] !== 'string' ||
    value['textSignature'].length > 200_000
  )
    return null;
  const profile = parseReviewSpeechProfile(value['profile']);
  if (!profile || value['textSignature'] !== reviewSpeechTextSignature(value['text'], profile))
    return null;
  return {
    id: value['id'],
    start: value['start'],
    end: value['end'],
    assetId: value['assetId'],
    duration: value['duration'],
    phraseId: value['phraseId'],
    revision: value['revision'],
    text: value['text'],
    textSignature: value['textSignature'],
    profile,
  };
}

function parseIntervals<T extends { id: string; start: number; end: number }>(
  value: unknown,
  parse: (value: unknown) => T | null
): T[] | null {
  if (!Array.isArray(value) || value.length > 2_000) return null;
  const result: T[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    const entry = parse(raw);
    if (!entry || ids.has(entry.id) || (result.length > 0 && entry.start < result.at(-1)!.end))
      return null;
    ids.add(entry.id);
    result.push(entry);
  }
  return result;
}

/** Rejects malformed new fields rather than silently losing transcript, references or history. */
export function parseReviewSpeechTranscript(value: unknown): ReviewSpeechTranscript | null;
export function parseReviewSpeechTranscript<R extends ReviewSpeechReplacement>(
  value: unknown,
  parseReplacement: (value: unknown) => R | null
): ReviewSpeechTranscript<R> | null;
export function parseReviewSpeechTranscript(
  value: unknown,
  parseReplacement: (
    value: unknown
  ) => ReviewSpeechReplacement | null = parseReviewSpeechReplacement
): ReviewSpeechTranscript | null {
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    (value['transcriptionModelId'] !== undefined && !identity(value['transcriptionModelId']))
  )
    return null;
  const phrases = parseIntervals(value['phrases'], parsePhrase);
  const replacements = parseIntervals(value['replacements'], parseReplacement);
  const profile =
    value['profile'] === undefined ? undefined : parseReviewSpeechProfile(value['profile']);
  if (
    !phrases ||
    !replacements ||
    profile === null ||
    phrases.reduce((sum, phrase) => sum + (phrase.words?.length ?? 0), 0) > 20_000
  )
    return null;
  return {
    version: 1,
    phrases,
    replacements,
    ...(profile ? { profile } : {}),
    ...(typeof value['transcriptionModelId'] === 'string'
      ? { transcriptionModelId: value['transcriptionModelId'] }
      : {}),
  };
}
