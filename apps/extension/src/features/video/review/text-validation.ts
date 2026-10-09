import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { normalizePaintColor } from '@sniptale/foundation/paint';
import { parseReviewSpeechPhrase, parseReviewSpeechProfile } from './speech-validation';
import type {
  ReviewCaptionSettings,
  ReviewCaptionStyle,
  ReviewTextDocument,
  ReviewTextFragment,
  ReviewTextOrigin,
  ReviewVoiceTextSnapshot,
} from './text-document';

const identity = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256 && value.trim() === value;
const revision = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const time = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86_400;

/** Same strict style contract is used by scene defaults and individual overrides. */
function parseReviewCaptionStyle(value: unknown): ReviewCaptionStyle | null {
  if (
    !isRecord(value) ||
    (value['position'] !== 'top' && value['position'] !== 'bottom') ||
    typeof value['fontSize'] !== 'number' ||
    !Number.isFinite(value['fontSize']) ||
    value['fontSize'] < 0.015 ||
    value['fontSize'] > 0.15 ||
    typeof value['color'] !== 'string' ||
    typeof value['background'] !== 'string'
  )
    return null;
  const color = normalizePaintColor(value['color']);
  const background = normalizePaintColor(value['background']);
  return color && background
    ? { position: value['position'], fontSize: value['fontSize'], color, background }
    : null;
}

/** Missing settings are handled by the caller; malformed authored settings are not silently discarded. */
export function parseReviewCaptionSettings(value: unknown): ReviewCaptionSettings | null {
  if (!isRecord(value) || typeof value['enabled'] !== 'boolean') return null;
  const style = parseReviewCaptionStyle(value['style']);
  return style ? { enabled: value['enabled'], style } : null;
}

function parseOrigin(value: unknown): ReviewTextOrigin | null {
  if (
    !isRecord(value) ||
    (value['kind'] !== 'original' && value['kind'] !== 'voiceover') ||
    !time(value['start']) ||
    !time(value['end']) ||
    value['start'] >= value['end'] ||
    (value['kind'] === 'voiceover' && !identity(value['clipId'])) ||
    (value['kind'] === 'original' && value['clipId'] !== undefined)
  )
    return null;
  const phrase = parseReviewSpeechPhrase({
    id: 'origin',
    start: value['start'],
    end: value['end'],
    text: '',
    originalText: '',
    revision: 0,
    alignment: 'range',
    ...(value['words'] === undefined ? {} : { words: value['words'] }),
  });
  if (!phrase) return null;
  return {
    kind: value['kind'],
    start: value['start'],
    end: value['end'],
    ...(typeof value['clipId'] === 'string' ? { clipId: value['clipId'] } : {}),
    ...(phrase.words ? { words: phrase.words } : {}),
  };
}

/** Standalone text permits overlaps and mixed clocks, while retaining bounded immutable provenance. */
function parseReviewTextFragment(value: unknown): ReviewTextFragment | null {
  if (
    !isRecord(value) ||
    !revision(value['timingRevision']) ||
    typeof value['showInVideo'] !== 'boolean' ||
    (value['timeDomain'] !== 'source' && value['timeDomain'] !== 'result') ||
    (value['language'] !== undefined && !identity(value['language'])) ||
    (value['variantId'] !== undefined && !identity(value['variantId']))
  )
    return null;
  const phrase = parseReviewSpeechPhrase(value);
  const style = value['style'] === undefined ? undefined : parseReviewCaptionStyle(value['style']);
  const origin = value['origin'] === undefined ? undefined : parseOrigin(value['origin']);
  if (!phrase || style === null || origin === null) return null;
  let derivedFrom: string[] | undefined;
  if (value['derivedFrom'] !== undefined) {
    if (
      !Array.isArray(value['derivedFrom']) ||
      value['derivedFrom'].length > 2_000 ||
      !value['derivedFrom'].every(identity) ||
      new Set(value['derivedFrom']).size !== value['derivedFrom'].length
    )
      return null;
    derivedFrom = [...value['derivedFrom']];
  }
  return {
    ...phrase,
    timeDomain: value['timeDomain'],
    timingRevision: value['timingRevision'],
    showInVideo: value['showInVideo'],
    ...(style ? { style } : {}),
    ...(origin ? { origin } : {}),
    ...(typeof value['language'] === 'string' ? { language: value['language'] } : {}),
    ...(typeof value['variantId'] === 'string' ? { variantId: value['variantId'] } : {}),
    ...(derivedFrom ? { derivedFrom } : {}),
  };
}

/** Parses current authored content without interpreting an embedded legacy transcript as a second document. */
export function parseReviewTextDocument(value: unknown): ReviewTextDocument | null {
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    !Array.isArray(value['fragments']) ||
    value['fragments'].length > 2_000
  )
    return null;
  const fragments: ReviewTextFragment[] = [];
  const ids = new Set<string>();
  let words = 0;
  let textUnits = 0;
  for (const raw of value['fragments']) {
    const fragment = parseReviewTextFragment(raw);
    if (!fragment || ids.has(fragment.id)) return null;
    ids.add(fragment.id);
    words += (fragment.words?.length ?? 0) + (fragment.origin?.words?.length ?? 0);
    textUnits += fragment.text.length + fragment.originalText.length;
    if (words > 40_000 || textUnits > 2_000_000) return null;
    fragments.push(fragment);
  }
  return { version: 1, fragments };
}

/** Accepted audio retains its prior text even when the referenced fragment no longer exists. */
export function parseReviewVoiceTextSnapshot(value: unknown): ReviewVoiceTextSnapshot | null {
  if (
    !isRecord(value) ||
    (value['kind'] !== 'ai' && value['kind'] !== 'microphone' && value['kind'] !== 'gallery') ||
    !identity(value['textId']) ||
    !revision(value['revision']) ||
    !revision(value['timingRevision']) ||
    typeof value['text'] !== 'string' ||
    value['text'].length > 16_000 ||
    !time(value['start']) ||
    !time(value['end']) ||
    value['start'] >= value['end'] ||
    (value['timeDomain'] !== 'source' && value['timeDomain'] !== 'result')
  )
    return null;
  const profile =
    value['profile'] === undefined ? undefined : parseReviewSpeechProfile(value['profile']);
  if (profile === null || (value['kind'] === 'ai' && !profile)) return null;
  return {
    kind: value['kind'],
    textId: value['textId'],
    revision: value['revision'],
    timingRevision: value['timingRevision'],
    text: value['text'],
    start: value['start'],
    end: value['end'],
    timeDomain: value['timeDomain'],
    ...(profile ? { profile } : {}),
  };
}
