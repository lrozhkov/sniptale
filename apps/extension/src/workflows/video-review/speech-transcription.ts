import type { AudioTranscriptResult, AudioTranscriptTiming } from '../../contracts/ai/audio';
import type { ReviewSpeechPhrase } from '../../features/video/review/speech-transcript';
import { createReviewTimeMap } from '../../features/video/review/timeline';
import { projectReviewVoiceover } from '../../features/video/review/voiceover-edits';
import { extractReviewSpeechWav, planReviewSpeechChunks } from './speech-audio';
import { runReviewSpeechJob } from './speech-client';
import {
  getReviewSpeechClip,
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
  const valid = (entries: AudioTranscriptTiming[] | undefined) =>
    entries?.length &&
    entries.every(
      (entry, index) =>
        Number.isFinite(entry.start) &&
        Number.isFinite(entry.end) &&
        entry.start >= 0 &&
        entry.end > entry.start &&
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
    (result.words?.length && !valid(result.words)) ||
    (result.segments?.length && !valid(result.segments))
  )
    throw new Error('invalid-response');
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
  clipId: string,
  modelId: string,
  signal: AbortSignal
): Promise<void> {
  await session.flush();
  const state = session.getSnapshot();
  const clip = getReviewSpeechClip(session, clipId);
  const map = createReviewTimeMap(
    state.snapshot.workspace.source.duration,
    state.document.edits
  ).getSegments();
  const slices = projectReviewVoiceover([clip], map);
  const ranges = slices.map((slice) => ({
    start: slice.sourceOffset,
    end: slice.sourceOffset + slice.duration * (slice.playbackRate ?? 1),
  }));
  const geometry = reviewSpeechGeometry(session, clipId);
  const identity = JSON.stringify([clipId, modelId, geometry]);
  const progress =
    incomplete.get(session)?.identity === identity
      ? incomplete.get(session)!
      : {
          identity,
          completed: new Set<string>(),
          chunks: await planReviewSpeechChunks(clip.assetId, ranges, signal),
        };
  incomplete.set(session, progress);
  const chunks = progress.chunks;
  for (const chunk of chunks) {
    signal.throwIfAborted();
    const chunkKey = JSON.stringify(chunk);
    if (progress.completed.has(chunkKey)) continue;
    if (reviewSpeechGeometry(session, clipId) !== geometry) throw new Error('stale');
    if (getReviewSpeechClip(session, clipId).assetId !== clip.assetId) throw new Error('stale');
    const scope = reviewSpeechScope(session, clipId, chunk.start, chunk.end);
    const beforeTranscript = getReviewSpeechClip(session, clipId).transcript;
    const signature = JSON.stringify(beforeTranscript);
    const result = await runReviewSpeechJob(
      { type: 'start', operation: 'transcription', requestId: crypto.randomUUID(), modelId, scope },
      {
        signal,
        prepareInput: (jobSignal) =>
          extractReviewSpeechWav(clip.assetId, chunk.start, chunk.end, jobSignal),
      }
    );
    signal.throwIfAborted();
    if (result.type !== 'transcript') throw new Error('invalid-response');
    const current = getReviewSpeechClip(session, clipId);
    if (
      reviewSpeechGeometry(session, clipId) !== geometry ||
      current.assetId !== clip.assetId ||
      JSON.stringify(current.transcript) !== signature
    )
      throw new Error('stale');
    const phrases = reviewSpeechPhrases(result.result, chunk.start, chunk.end);
    const transcript = current.transcript ?? { version: 1 as const, phrases: [], replacements: [] };
    await saveReviewSpeechTranscript(session, clipId, {
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
