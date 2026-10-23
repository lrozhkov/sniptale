import type {
  AudioTranscriptResult,
  AudioTranscriptTiming,
  ReviewSpeechTarget,
} from '../../contracts/ai/audio';
import type {
  ReviewSpeechPhrase,
  ReviewSpeechTranscript,
} from '../../features/video/review/speech-transcript';
import {
  reviewSpeechPublicationBasis,
  type ReviewSpeechPublicationChange,
  type ReviewSpeechPublicationReceipt,
} from './speech-publication-state';
import { createReviewTimeMap } from '../../features/video/review/timeline';
import { projectReviewVoiceover } from '../../features/video/review/voiceover-edits';
import {
  extractReviewSpeechWav,
  planReviewSpeechChunks,
  reviewSpeechWavIsSilent,
} from './speech-audio';
import { runReviewSpeechJob } from '../audio-jobs/client';
import {
  getReviewSpeechClip,
  getReviewSpeechTarget,
  reviewSpeechGeometry,
  reviewSpeechScope,
  type ReviewSpeechSession,
} from './speech-publication';

/** Recover text spans only when the complete lexical sequence matches the timed words. */
function wordTextSpans(result: AudioTranscriptResult) {
  const lexical = (text: string) => text.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  const words = result.words;
  if (!words?.length || words.some((word) => !lexical(word.text))) return null;
  if (lexical(result.text) !== words.map((word) => lexical(word.text)).join('')) return null;
  let cursor = 0;
  return words.map((word) => {
    const from = cursor;
    let remaining = Array.from(lexical(word.text)).length;
    while (remaining > 0 && cursor < result.text.length) {
      const character = String.fromCodePoint(result.text.codePointAt(cursor)!);
      cursor += character.length;
      if (/[\p{L}\p{N}]/u.test(character)) remaining--;
    }
    while (cursor < result.text.length) {
      const character = String.fromCodePoint(result.text.codePointAt(cursor)!);
      if (/[\p{L}\p{N}]/u.test(character)) break;
      cursor += character.length;
    }
    return { from, to: cursor };
  });
}

/** Provider segments are not sentences; split words at pauses and punctuation. */
export function reviewSpeechPhrases(
  result: AudioTranscriptResult,
  start: number,
  end: number,
  options: { splitAtPauses?: boolean } = {}
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
  const spans = wordTextSpans(result);
  const segmentTextMatches =
    result.segments
      ?.map((segment) => segment.text)
      .join('')
      .replace(/\s/gu, '') === result.text.replace(/\s/gu, '');
  if (
    (result.words?.some((word) => word.start === word.end) || (result.words?.length && !spans)) &&
    valid(result.segments) &&
    segmentTextMatches
  ) {
    let cursor = 0;
    return result
      .segments!.filter((segment) => segment.text.trim())
      .flatMap((segment) => {
        const words: AudioTranscriptTiming[] = [];
        while (cursor < (result.words?.length ?? 0)) {
          const word = result.words![cursor]!;
          if (word.start >= segment.end) break;
          cursor++;
          if (word.start >= segment.start && word.end <= segment.end)
            words.push({
              ...word,
              start: word.start - segment.start,
              end: word.end - segment.start,
            });
        }
        const local = { text: segment.text.trim(), words };
        return words.length &&
          !words.some((word) => word.start === word.end) &&
          wordTextSpans(local)
          ? reviewSpeechPhrases(
              local,
              start + segment.start,
              Math.min(end, start + segment.end),
              options
            )
          : [
              phrase(
                segment.text.trim(),
                start + segment.start,
                Math.min(end, start + segment.end),
                'segment'
              ),
            ];
      });
  }
  if (result.words?.some((word) => word.start === word.end) || (result.words?.length && !spans)) {
    const anchors = result.words?.filter((word) => word.end > word.start);
    return [phrase(result.text.trim(), start, end, 'range', anchors?.length ? anchors : undefined)];
  }
  if (valid(result.words)) {
    const groups: AudioTranscriptTiming[][] = [];
    const restored = result.words!.map((word, index) => ({
      ...word,
      text: result.text.slice(spans![index]!.from, spans![index]!.to).trim(),
    }));
    for (const word of restored) {
      const group = groups.at(-1);
      const previous = group?.at(-1);
      if (
        !group ||
        !previous ||
        (options.splitAtPauses !== false && word.start - previous.end >= 0.45) ||
        /[.!?。！？]$/u.test(previous.text)
      )
        groups.push([word]);
      else group.push(word);
    }
    return groups.map((group) =>
      phrase(
        result.text
          .slice(
            spans![restored.indexOf(group[0]!)]!.from,
            spans![restored.indexOf(group.at(-1)!)]!.to
          )
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

interface ReviewTranscriptionProgress {
  identity: string;
  transcriptBasis: string;
  completed: Map<string, ReviewSpeechPhrase[]>;
  chunks: { start: number; end: number }[];
  publication?: {
    changes: ReviewSpeechPublicationChange[];
    receipt: ReviewSpeechPublicationReceipt;
  };
}
const incomplete = new WeakMap<ReviewSpeechSession, ReviewTranscriptionProgress>();

/** Completed chunks remain in this page's job; only the final publication adds an Undo action. */
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
      ? [
          {
            start: selection?.start ?? 0,
            end: selection?.end ?? state.snapshot.workspace.source.duration,
          },
        ]
      : projectReviewVoiceover([getReviewSpeechClip(session, target.clipId)], map).map((slice) => ({
          start: slice.sourceOffset,
          end: slice.sourceOffset + slice.duration * (slice.playbackRate ?? 1),
        }));
  const geometry = reviewSpeechGeometry(session, target);
  const identity = JSON.stringify([target, modelId, geometry, selection]);
  const previous = incomplete.get(session);
  if (previous?.identity === identity && previous.publication) {
    signal.throwIfAborted();
    await session.publishSpeechTranscripts(
      previous.publication.changes,
      previous.publication.receipt
    );
    incomplete.delete(session);
    return;
  }
  await session.flush();
  const progress: ReviewTranscriptionProgress =
    incomplete.get(session)?.identity === identity
      ? incomplete.get(session)!
      : {
          identity,
          transcriptBasis: JSON.stringify(clip.transcript ?? null),
          completed: new Map<string, ReviewSpeechPhrase[]>(),
          chunks: await planReviewSpeechChunks(source, ranges, signal).catch(() => {
            signal.throwIfAborted();
            throw new Error('decode-failed');
          }),
        };
  incomplete.set(session, progress);
  if (
    JSON.stringify(getReviewSpeechTarget(session, target).transcript ?? null) !==
    progress.transcriptBasis
  )
    throw new Error('stale');
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
    progress.completed.set(chunkKey, reviewSpeechPhrases(result.result, chunk.start, chunk.end));
  }
  signal.throwIfAborted();
  let transcript: ReviewSpeechTranscript = getReviewSpeechTarget(session, target).transcript ?? {
    version: 1,
    phrases: [],
    replacements: [],
  };
  for (const chunk of chunks)
    transcript = {
      ...transcript,
      transcriptionModelId: modelId,
      phrases: [
        ...transcript.phrases.filter(
          (phrase) => phrase.end <= chunk.start || phrase.start >= chunk.end
        ),
        ...progress.completed.get(JSON.stringify(chunk))!,
      ].sort((a, b) => a.start - b.start),
    };
  const current = session.getSnapshot();
  progress.publication = {
    changes: [
      {
        target,
        transcript,
        ...reviewSpeechPublicationBasis(current.snapshot, current.document, target),
      },
    ],
    receipt: session.createSpeechPublicationReceipt(),
  };
  await session.publishSpeechTranscripts(
    progress.publication.changes,
    progress.publication.receipt
  );
  incomplete.delete(session);
}
