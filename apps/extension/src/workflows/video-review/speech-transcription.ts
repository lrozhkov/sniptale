import type {
  AudioTranscriptResult,
  AudioTranscriptTiming,
  ReviewSpeechTarget,
} from '../../contracts/ai/audio';
import type { ReviewSpeechPhrase } from '../../features/video/review/speech-transcript';
import { createReviewTimeMap } from '../../features/video/review/timeline';
import { projectReviewVoiceover } from '../../features/video/review/voiceover-edits';
import {
  extractReviewSpeechWav,
  planReviewSpeechChunks,
  reviewSpeechWavIsSilent,
} from './speech-audio';
import { runReviewSpeechJob } from './speech-client';
import {
  getReviewSpeechClip,
  getReviewSpeechTarget,
  reviewSpeechGeometry,
  reviewSpeechScope,
  saveReviewSpeechTranscript,
  type ReviewSpeechSession,
} from './speech-publication';

/** Nonoverlapping chunks also give text-only providers honest fallback intervals. */
export function reviewSpeechChunks(
  ranges: readonly { start: number; end: number }[]
): { start: number; end: number }[] {
  return ranges.flatMap((range) => {
    const chunks: { start: number; end: number }[] = [];
    for (let start = range.start; start < range.end - 1e-7; start += 60)
      chunks.push({ start, end: Math.min(range.end, start + 60) });
    return chunks;
  });
}
/** Provider segments are not sentences; split words at pauses and punctuation. */
export function reviewSpeechPhrases(
  result: AudioTranscriptResult,
  start: number,
  end: number
): ReviewSpeechPhrase[] {
  if (!result.text.trim()) return [];
  const valid = (entries: AudioTranscriptTiming[] | undefined, allowZero = false) =>
    entries?.length &&
    entries.every(
      (entry, index) =>
        Number.isFinite(entry.start) &&
        Number.isFinite(entry.end) &&
        entry.start >= 0 &&
        (allowZero ? entry.end >= entry.start : entry.end > entry.start) &&
        entry.end <= end - start + 0.05 &&
        (index === 0 || entry.start >= entries[index - 1]!.end)
    );
  const phrase = (
    text: string,
    a: number,
    b: number,
    alignment: ReviewSpeechPhrase['alignment'],
    words?: AudioTranscriptTiming[]
  ): ReviewSpeechPhrase => ({
    id: crypto.randomUUID(),
    start: a,
    end: b,
    originalText: text,
    text,
    revision: 0,
    alignment,
    ...(words
      ? {
          words: words.map((word) => ({
            ...word,
            start: start + word.start,
            end: Math.min(end, start + word.end),
          })),
        }
      : {}),
  });
  if (
    (result.words?.length && !valid(result.words, true)) ||
    (result.segments?.length && !valid(result.segments))
  )
    throw new Error('invalid-response');
  if (result.words?.some((word) => word.start === word.end)) {
    const anchors = result.words.filter((word) => word.end > word.start);
    // The chunk is the only proven bound for missing alignment. Preserve the complete
    // provider text and valid anchors without assigning invented times to missing words.
    return [phrase(result.text.trim(), start, end, 'range', anchors.length ? anchors : undefined)];
  }
  if (valid(result.words)) {
    const groups: AudioTranscriptTiming[][] = [];
    for (const word of result.words!) {
      const group = groups.at(-1);
      const previous = group?.at(-1);
      if (
        !group ||
        !previous ||
        word.start - previous.end >= 0.45 ||
        /[.!?。！？]$/u.test(previous.text)
      )
        groups.push([word]);
      else group.push(word);
    }
    return groups.map((group) =>
      phrase(
        group
          .map((word) => word.text)
          .join(' ')
          .trim(),
        start + group[0]!.start,
        Math.min(end, start + group.at(-1)!.end),
        'word',
        group
      )
    );
  }
  if (valid(result.segments))
    return result
      .segments!.filter((segment) => segment.text.trim())
      .map((segment) =>
        phrase(
          segment.text.trim(),
          start + segment.start,
          Math.min(end, start + segment.end),
          'segment'
        )
      );
  return [phrase(result.text.trim(), start, end, 'range')];
}

const incomplete = new WeakMap<
  ReviewSpeechSession,
  { identity: string; completed: Set<string>; chunks: { start: number; end: number }[] }
>();

/** Each accepted chunk is durable; interruption retains completed chunks without another POST. */
export async function transcribeReviewSpeech(
  session: ReviewSpeechSession,
  target: ReviewSpeechTarget,
  modelId: string,
  signal: AbortSignal,
  options: {
    original?: { file: Blob; sourceAssetId: string };
    selection?: { start: number; end: number };
  } = {}
): Promise<void> {
  await session.flush();
  const state = session.getSnapshot();
  const clip = getReviewSpeechTarget(session, target);
  if (
    target.kind === 'original' &&
    (!options.original || options.original.sourceAssetId !== clip.assetId)
  )
    throw new Error('stale');
  const source = target.kind === 'original' ? options.original!.file : clip.assetId;
  const selection = options.selection;
  if (
    selection &&
    (!Number.isFinite(selection.start) ||
      !Number.isFinite(selection.end) ||
      selection.start < 0 ||
      selection.end <= selection.start ||
      selection.end > state.snapshot.workspace.source.duration)
  )
    throw new Error('invalid-request');
  const map = createReviewTimeMap(
    state.snapshot.workspace.source.duration,
    state.document.edits
  ).getSegments();
  const ranges =
    target.kind === 'original'
      ? map
          .filter((part) => part.kind !== 'cut')
          .map((part) => ({
            start: Math.max(part.sourceStart, selection?.start ?? 0),
            end: Math.min(
              part.sourceEnd,
              selection?.end ?? state.snapshot.workspace.source.duration
            ),
          }))
          .filter((range) => range.end > range.start)
      : projectReviewVoiceover([getReviewSpeechClip(session, target.clipId)], map).map((slice) => ({
          start: slice.sourceOffset,
          end: slice.sourceOffset + slice.duration * (slice.playbackRate ?? 1),
        }));
  const geometry = reviewSpeechGeometry(session, target);
  const identity = JSON.stringify([target, modelId, geometry, selection]);
  const progress =
    incomplete.get(session)?.identity === identity
      ? incomplete.get(session)!
      : {
          identity,
          completed: new Set<string>(),
          chunks: await planReviewSpeechChunks(source, ranges, signal).catch(() => {
            signal.throwIfAborted();
            throw new Error('decode-failed');
          }),
        };
  incomplete.set(session, progress);
  const chunks = progress.chunks;
  for (const chunk of chunks) {
    signal.throwIfAborted();
    const chunkKey = JSON.stringify(chunk);
    if (progress.completed.has(chunkKey)) continue;
    if (reviewSpeechGeometry(session, target) !== geometry) throw new Error('stale');
    if (getReviewSpeechTarget(session, target).assetId !== clip.assetId) throw new Error('stale');
    const scope = reviewSpeechScope(session, target, chunk.start, chunk.end);
    const beforeTranscript = getReviewSpeechTarget(session, target).transcript;
    const signature = JSON.stringify(beforeTranscript);
    const result = await runReviewSpeechJob(
      { type: 'start', operation: 'transcription', requestId: crypto.randomUUID(), modelId, scope },
      {
        signal,
        prepareInput: async (jobSignal) => {
          const wav = await extractReviewSpeechWav(source, chunk.start, chunk.end, jobSignal);
          return (await reviewSpeechWavIsSilent(wav, jobSignal)) ? null : wav;
        },
      }
    );
    signal.throwIfAborted();
    if (result.type !== 'transcript') throw new Error('invalid-response');
    const current = getReviewSpeechTarget(session, target);
    if (
      reviewSpeechGeometry(session, target) !== geometry ||
      current.assetId !== clip.assetId ||
      JSON.stringify(current.transcript) !== signature
    )
      throw new Error('stale');
    const phrases = reviewSpeechPhrases(result.result, chunk.start, chunk.end);
    const transcript = current.transcript ?? { version: 1 as const, phrases: [], replacements: [] };
    await saveReviewSpeechTranscript(session, target, {
      ...transcript,
      transcriptionModelId: modelId,
      phrases: [
        ...transcript.phrases.filter(
          (phrase) => phrase.end <= chunk.start || phrase.start >= chunk.end
        ),
        ...phrases,
      ].sort((a, b) => a.start - b.start),
    });
    progress.completed.add(chunkKey);
  }
  incomplete.delete(session);
}
