import type {
  ReviewSpeechPhrase,
  ReviewSpeechProfile,
  ReviewSpeechWord,
} from './speech-transcript';
import { parseReviewTextDocument } from './text-validation';
import type { AudioTextJobScope } from '../../../contracts/ai/audio';

/** The port and staging owners recheck the same immutable authored placement basis. */
export function matchesReviewTextScope(
  fragment: ReviewTextFragment | undefined,
  scope: AudioTextJobScope
): boolean {
  return (
    !!fragment &&
    fragment.id === scope.target.fragmentId &&
    fragment.revision === scope.textRevision &&
    fragment.timingRevision === scope.timingRevision &&
    fragment.start === scope.start &&
    fragment.end === scope.end &&
    fragment.timeDomain === scope.timeDomain
  );
}

/** Provenance is descriptive, not an asset lease or authority to extract audio. */
export interface ReviewTextOrigin {
  kind: 'original' | 'voiceover';
  clipId?: string;
  /** Native seconds of the recognized source, independent of the current placement. */
  start: number;
  end: number;
  words?: ReviewSpeechWord[];
}

/** Caption sizes are fractions of the final frame height, independent of camera zoom. */
export interface ReviewCaptionStyle {
  position: 'top' | 'bottom';
  fontSize: number;
  color: string;
  background: string;
}

export interface ReviewCaptionSettings {
  enabled: boolean;
  style: ReviewCaptionStyle;
}

/** Words, start and end share the declared clock; revision counts content changes only. */
export interface ReviewTextFragment extends ReviewSpeechPhrase {
  timeDomain: 'source' | 'result';
  timingRevision: number;
  showInVideo: boolean;
  style?: ReviewCaptionStyle;
  origin?: ReviewTextOrigin;
  language?: string;
  variantId?: string;
  derivedFrom?: string[];
}

/** Standalone authored text; audio clips and their lifetimes are independent. */
export interface ReviewTextDocument {
  version: 1;
  fragments: ReviewTextFragment[];
}

/** Immutable association retained by an ordinary voiceover clip, even after text deletion. */
export interface ReviewVoiceTextSnapshot {
  kind: 'ai' | 'microphone' | 'gallery';
  textId: string;
  revision: number;
  timingRevision: number;
  text: string;
  start: number;
  end: number;
  timeDomain: 'source' | 'result';
  profile?: ReviewSpeechProfile;
}

export type ReviewTextEditResult =
  | { ok: true; document: ReviewTextDocument }
  | { ok: false; reason: 'stale' | 'invalid' | 'alignment' | 'gap' };

export const createReviewTextDocument = (): ReviewTextDocument => ({ version: 1, fragments: [] });

/** Shared scene and per-fragment style defaults; legacy documents do not enable burn-in. */
export function createReviewCaptionSettings(): ReviewCaptionSettings {
  return {
    enabled: false,
    style: { position: 'bottom', fontSize: 0.04, color: '#ffffffff', background: '#000000b3' },
  };
}

function replaceFragments(
  document: ReviewTextDocument,
  fragments: ReviewTextFragment[]
): ReviewTextEditResult {
  const parsed = parseReviewTextDocument({ ...document, fragments });
  return parsed ? { ok: true, document: parsed } : { ok: false, reason: 'invalid' };
}

/** Creates text without requiring an audio source or a provider configuration. */
export function addReviewTextFragment(
  document: ReviewTextDocument,
  args: {
    id: string;
    start: number;
    end: number;
    text?: string;
    timeDomain?: 'source' | 'result';
  }
): ReviewTextEditResult {
  return replaceFragments(document, [
    ...document.fragments,
    {
      id: args.id,
      start: args.start,
      end: args.end,
      text: args.text ?? '',
      originalText: '',
      revision: 0,
      timingRevision: 0,
      timeDomain: args.timeDomain ?? 'result',
      alignment: 'manual',
      showInVideo: true,
    },
  ]);
}

/** Edits text, placement or appearance without rewriting any accepted audio. */
export function editReviewTextFragment(
  document: ReviewTextDocument,
  id: string,
  patch: {
    text?: string;
    start?: number;
    end?: number;
    showInVideo?: boolean;
    style?: ReviewCaptionStyle | null;
    language?: string;
  }
): ReviewTextEditResult {
  const current = document.fragments.find((fragment) => fragment.id === id);
  if (!current) return { ok: false, reason: 'stale' };
  const textChanged = patch.text !== undefined && patch.text !== current.text;
  const timingChanged =
    (patch.start !== undefined && patch.start !== current.start) ||
    (patch.end !== undefined && patch.end !== current.end);
  const { style, ...fields } = patch;
  const next: ReviewTextFragment = {
    ...current,
    ...fields,
    revision: current.revision + (textChanged ? 1 : 0),
    timingRevision: current.timingRevision + (timingChanged ? 1 : 0),
  };
  if (style === null) delete next.style;
  else if (style !== undefined) next.style = style;
  if (textChanged || timingChanged) {
    next.alignment = 'manual';
    delete next.words;
  }
  return replaceFragments(
    document,
    document.fragments.map((fragment) => (fragment.id === id ? next : fragment))
  );
}

/** A caret at an aligned word boundary preserves the actual silence between words. */
export function reviewTextSplitBoundary(
  fragment: ReviewTextFragment,
  position: number
): {
  leftEnd: number;
  rightStart: number;
  leftWords: ReviewSpeechWord[];
  rightWords: ReviewSpeechWord[];
} | null {
  if (fragment.alignment !== 'word' || !fragment.words?.length) return null;
  const leftWords: ReviewSpeechWord[] = [];
  const rightWords: ReviewSpeechWord[] = [];
  let offset = 0;
  for (const word of fragment.words) {
    const start = fragment.text.indexOf(word.text, offset);
    if (start < 0) return null;
    const end = start + word.text.length;
    if (start < position && end > position) return null;
    (end <= position ? leftWords : rightWords).push(word);
    offset = end;
  }
  const left = leftWords.at(-1);
  const right = rightWords[0];
  return left && right
    ? { leftEnd: left.end, rightStart: right.start, leftWords, rightWords }
    : null;
}

/** Splits with proven word timing or an explicit manually chosen time, never an invented midpoint. */
export function splitReviewTextFragment(
  document: ReviewTextDocument,
  id: string,
  args: {
    id: string;
    position: number;
    time?: number;
  }
): ReviewTextEditResult {
  const fragment = document.fragments.find((entry) => entry.id === id);
  if (!fragment) return { ok: false, reason: 'stale' };
  if (
    !Number.isInteger(args.position) ||
    args.position <= 0 ||
    args.position >= fragment.text.length
  )
    return { ok: false, reason: 'invalid' };
  const boundary =
    args.time === undefined ? reviewTextSplitBoundary(fragment, args.position) : null;
  if (!boundary && args.time === undefined) return { ok: false, reason: 'alignment' };
  const leftEnd = boundary?.leftEnd ?? args.time!;
  const rightStart = boundary?.rightStart ?? args.time!;
  const leftText = fragment.text.slice(0, args.position).trim();
  const rightText = fragment.text.slice(args.position).trim();
  if (
    !leftText ||
    !rightText ||
    leftEnd <= fragment.start ||
    rightStart >= fragment.end ||
    leftEnd > rightStart
  )
    return { ok: false, reason: 'invalid' };
  const { words: _words, ...base } = fragment;
  const left: ReviewTextFragment = {
    ...base,
    text: leftText,
    end: leftEnd,
    revision: fragment.revision + 1,
    timingRevision: fragment.timingRevision + 1,
    alignment: boundary ? 'word' : 'manual',
    ...(boundary ? { words: boundary.leftWords } : {}),
  };
  const right: ReviewTextFragment = {
    ...base,
    id: args.id,
    text: rightText,
    start: rightStart,
    revision: fragment.revision + 1,
    timingRevision: fragment.timingRevision + 1,
    alignment: boundary ? 'word' : 'manual',
    ...(boundary ? { words: boundary.rightWords } : {}),
    derivedFrom: [fragment.id],
  };
  return replaceFragments(
    document,
    document.fragments.flatMap((entry) => (entry.id === id ? [left, right] : [entry]))
  );
}

/** Merging does not flatten pauses, distinct source clocks or conflicting caption styles. */
export function mergeReviewTextFragments(
  document: ReviewTextDocument,
  leftId: string,
  rightId: string
): ReviewTextEditResult {
  const left = document.fragments.find((entry) => entry.id === leftId);
  const right = document.fragments.find((entry) => entry.id === rightId);
  if (!left || !right || leftId === rightId) return { ok: false, reason: 'stale' };
  if (
    Math.abs(left.end - right.start) > 1e-7 ||
    left.timeDomain !== right.timeDomain ||
    left.origin?.kind !== right.origin?.kind ||
    left.origin?.clipId !== right.origin?.clipId ||
    left.showInVideo !== right.showInVideo ||
    JSON.stringify(left.style) !== JSON.stringify(right.style) ||
    left.language !== right.language ||
    left.variantId !== right.variantId
  )
    return { ok: false, reason: 'gap' };
  const sameOrigin = JSON.stringify(left.origin) === JSON.stringify(right.origin);
  if (
    !sameOrigin &&
    left.origin &&
    right.origin &&
    Math.abs(left.origin.end - right.origin.start) > 1e-7
  )
    return { ok: false, reason: 'gap' };
  const { words: _words, ...base } = left;
  const merged: ReviewTextFragment = {
    ...base,
    end: right.end,
    text: [left.text, right.text].filter(Boolean).join(' '),
    originalText: [left.originalText, right.originalText].filter(Boolean).join(' '),
    revision: Math.max(left.revision, right.revision) + 1,
    timingRevision: Math.max(left.timingRevision, right.timingRevision) + 1,
    alignment: 'manual',
    derivedFrom: [leftId, rightId],
    ...(!sameOrigin && left.origin && right.origin
      ? {
          origin: {
            ...left.origin,
            end: right.origin.end,
            ...(left.origin.words && right.origin.words
              ? { words: [...left.origin.words, ...right.origin.words] }
              : {}),
          },
        }
      : {}),
  };
  return replaceFragments(
    document,
    document.fragments.flatMap((entry) =>
      entry.id === leftId ? [merged] : entry.id === rightId ? [] : [entry]
    )
  );
}

/** Removes only text; associated ordinary audio clips retain their immutable snapshot. */
export function deleteReviewTextFragments(
  document: ReviewTextDocument,
  ids: readonly string[]
): ReviewTextDocument {
  const selected = new Set(ids);
  return { ...document, fragments: document.fragments.filter((entry) => !selected.has(entry.id)) };
}

/** Reports content and placement separately; caption edits never invalidate a voice take. */
export function reviewVoiceTextStatus(
  fragment: ReviewTextFragment | undefined,
  snapshot: ReviewVoiceTextSnapshot
) {
  if (!fragment) return 'unlinked';
  if (
    fragment.id !== snapshot.textId ||
    fragment.text !== snapshot.text ||
    fragment.revision !== snapshot.revision
  )
    return 'text-changed';
  if (
    fragment.timingRevision !== snapshot.timingRevision ||
    fragment.start !== snapshot.start ||
    fragment.end !== snapshot.end ||
    fragment.timeDomain !== snapshot.timeDomain
  )
    return 'timing-changed';
  return 'current';
}
