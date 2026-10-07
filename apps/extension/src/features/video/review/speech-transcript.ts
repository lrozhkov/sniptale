/** Absolute seconds in the intact original audio asset. */
export interface ReviewSpeechWord {
  text: string;
  start: number;
  end: number;
}

/** Editable segmentation; applied audio remains independent of these boundaries. */
export interface ReviewSpeechPhrase {
  id: string;
  start: number;
  end: number;
  originalText: string;
  text: string;
  revision: number;
  alignment: 'word' | 'segment' | 'manual' | 'range';
  words?: ReviewSpeechWord[];
}

/** User-selected synthesis settings retained with the project. */
export interface ReviewSpeechProfile {
  modelId: string;
  voiceId: string;
  responseFormat: 'mp3' | 'wav';
  speed?: number;
  instructions?: string;
}

/** Immutable accepted audio; duration is native generated seconds, never stretched to fill. */
export interface ReviewSpeechReplacement {
  id: string;
  start: number;
  end: number;
  assetId: string;
  duration: number;
  phraseId: string;
  revision: number;
  text: string;
  textSignature: string;
  profile: ReviewSpeechProfile;
}

/** Versioned optional voiceover document; previews and running requests are disposable. */
export interface ReviewSpeechTranscript {
  version: 1;
  phrases: ReviewSpeechPhrase[];
  replacements: ReviewSpeechReplacement[];
  profile?: ReviewSpeechProfile;
  transcriptionModelId?: string;
}

export type ReviewSpeechEditResult =
  | { ok: true; transcript: ReviewSpeechTranscript }
  | { ok: false; reason: 'stale' | 'duration' | 'partial-replacement' | 'invalid' };

/** Canonical request snapshot; changing any synthesis setting invalidates a preview. */
export function reviewSpeechTextSignature(text: string, profile: ReviewSpeechProfile): string {
  return JSON.stringify([
    text,
    profile.modelId,
    profile.voiceId,
    profile.responseFormat,
    profile.speed ?? 1,
    profile.instructions ?? '',
  ]);
}

const validRange = (start: number, end: number) =>
  Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= 86_400;
const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) =>
  a.start < b.end && b.start < a.end;

function replacePhrases(
  transcript: ReviewSpeechTranscript,
  phrases: ReviewSpeechPhrase[]
): ReviewSpeechEditResult {
  const ordered = [...phrases].sort((a, b) => a.start - b.start);
  if (
    ordered.length > 2_000 ||
    new Set(ordered.map((phrase) => phrase.id)).size !== ordered.length ||
    ordered.some(
      (phrase, index) =>
        !validRange(phrase.start, phrase.end) ||
        !phrase.id.trim() ||
        phrase.id.length > 256 ||
        !Number.isSafeInteger(phrase.revision) ||
        phrase.text.length > 16_000 ||
        phrase.originalText.length > 16_000 ||
        (index > 0 && overlaps(ordered[index - 1]!, phrase))
    )
  )
    return { ok: false, reason: 'invalid' };
  return { ok: true, transcript: { ...transcript, phrases: ordered } };
}

/** Edits draft text or boundaries without mutating previously accepted replacements. */
export function editReviewSpeechPhrase(
  transcript: ReviewSpeechTranscript,
  id: string,
  patch: { text?: string; start?: number; end?: number }
): ReviewSpeechEditResult {
  const phrase = transcript.phrases.find((entry) => entry.id === id);
  if (!phrase) return { ok: false, reason: 'stale' };
  const changed = { ...phrase, ...patch, revision: phrase.revision + 1 };
  if (patch.start !== undefined || patch.end !== undefined) {
    changed.alignment = 'manual';
    delete changed.words;
  }
  return replacePhrases(
    transcript,
    transcript.phrases.map((entry) => (entry.id === id ? changed : entry))
  );
}

/** Splits one draft interval; callers explicitly choose the new text on each side. */
export function splitReviewSpeechPhrase(
  transcript: ReviewSpeechTranscript,
  id: string,
  args: {
    id: string;
    time: number;
    leftText: string;
    rightText: string;
    leftOriginalText?: string;
    rightOriginalText?: string;
  }
): ReviewSpeechEditResult {
  const phrase = transcript.phrases.find((entry) => entry.id === id);
  if (!phrase) return { ok: false, reason: 'stale' };
  if (args.time <= phrase.start || args.time >= phrase.end || !args.id.trim())
    return { ok: false, reason: 'invalid' };
  const { words: _words, ...base } = phrase;
  const revision = phrase.revision + 1;
  return replacePhrases(
    transcript,
    transcript.phrases.flatMap((entry) =>
      entry.id !== id
        ? [entry]
        : [
            {
              ...base,
              end: args.time,
              text: args.leftText,
              originalText: args.leftOriginalText ?? phrase.originalText,
              revision,
              alignment: 'manual',
            },
            {
              ...base,
              id: args.id,
              start: args.time,
              text: args.rightText,
              originalText: args.rightOriginalText ?? '',
              revision,
              alignment: 'manual',
            },
          ]
    )
  );
}

/** Only adjacent touching native ranges can merge; unrecognized gaps remain untouched. */
export function mergeReviewSpeechPhrases(
  transcript: ReviewSpeechTranscript,
  leftId: string,
  rightId: string
): ReviewSpeechEditResult {
  const index = transcript.phrases.findIndex((entry) => entry.id === leftId);
  const left = transcript.phrases[index];
  const right = transcript.phrases[index + 1];
  if (!left || !right || right.id !== rightId) return { ok: false, reason: 'stale' };
  if (Math.abs(left.end - right.start) > 1e-7) return { ok: false, reason: 'invalid' };
  const { words: _words, ...base } = left;
  const merged: ReviewSpeechPhrase = {
    ...base,
    end: right.end,
    text: [left.text, right.text].filter(Boolean).join(' '),
    originalText: [left.originalText, right.originalText].filter(Boolean).join(' '),
    revision: Math.max(left.revision, right.revision) + 1,
    alignment: 'manual',
  };
  return replacePhrases(
    transcript,
    transcript.phrases.flatMap((entry) =>
      entry.id === leftId ? [merged] : entry.id === rightId ? [] : [entry]
    )
  );
}

/** Explicitly returns whole accepted intervals to the original recording. */
export function restoreReviewSpeechReplacements(
  transcript: ReviewSpeechTranscript,
  ids: readonly string[]
): ReviewSpeechTranscript {
  return {
    ...transcript,
    replacements: transcript.replacements.filter((entry) => !ids.includes(entry.id)),
  };
}

/** Applies a batch atomically; partial replacement of an old generated interval is forbidden. */
export function applyReviewSpeechReplacements(
  transcript: ReviewSpeechTranscript,
  replacements: readonly ReviewSpeechReplacement[],
  restoreIds: readonly string[] = []
): ReviewSpeechEditResult {
  const ordered = [...replacements].sort((a, b) => a.start - b.start);
  for (const [index, replacement] of ordered.entries()) {
    const phrase = transcript.phrases.find((entry) => entry.id === replacement.phraseId);
    if (
      !phrase ||
      !transcript.profile ||
      phrase.revision !== replacement.revision ||
      phrase.start !== replacement.start ||
      phrase.end !== replacement.end ||
      phrase.text !== replacement.text ||
      replacement.textSignature !== reviewSpeechTextSignature(phrase.text, transcript.profile) ||
      replacement.textSignature !== reviewSpeechTextSignature(replacement.text, replacement.profile)
    )
      return { ok: false, reason: 'stale' };
    if (
      !validRange(replacement.start, replacement.end) ||
      !replacement.id.trim() ||
      replacement.id.length > 256 ||
      !replacement.assetId.startsWith('project-asset:') ||
      replacement.assetId.length > 256 ||
      !Number.isFinite(replacement.duration) ||
      replacement.duration <= 0
    )
      return { ok: false, reason: 'invalid' };
    if (replacement.duration > replacement.end - replacement.start)
      return { ok: false, reason: 'duration' };
    if (index > 0 && overlaps(ordered[index - 1]!, replacement))
      return { ok: false, reason: 'invalid' };
  }
  const retained = transcript.replacements.filter((previous) => {
    if (restoreIds.includes(previous.id)) return false;
    return !ordered.some((entry) => overlaps(entry, previous));
  });
  for (const previous of transcript.replacements) {
    if (restoreIds.includes(previous.id) || !ordered.some((entry) => overlaps(entry, previous)))
      continue;
    let covered = previous.start;
    for (const entry of ordered) {
      if (entry.end <= covered || entry.start >= previous.end) continue;
      if (entry.start > covered + 1e-7) break;
      covered = Math.max(covered, entry.end);
    }
    if (covered < previous.end - 1e-7) return { ok: false, reason: 'partial-replacement' };
  }
  const next = [...retained, ...ordered].sort((a, b) => a.start - b.start);
  if (next.length > 2_000 || new Set(next.map((entry) => entry.id)).size !== next.length)
    return { ok: false, reason: 'invalid' };
  return {
    ok: true,
    transcript: {
      ...transcript,
      replacements: next.map((entry) => ({ ...entry, profile: { ...entry.profile } })),
    },
  };
}
