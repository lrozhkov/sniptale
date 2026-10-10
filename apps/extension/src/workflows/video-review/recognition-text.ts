import type { AudioTranscriptResult, ReviewSpeechTarget } from '../../contracts/ai/audio';
import type { ReviewSpeechPhrase } from '../../features/video/review/speech-transcript';
import type { ReviewTextFragment } from '../../features/video/review/text-document';
import type { projectReviewVoiceover } from '../../features/video/review/voiceover-edits';
import { reviewSpeechPhrases } from './speech-transcription';

export type ReviewRecognitionGrouping = 'sentences' | 'sentences-pauses';
export interface RecognitionChunk {
  start: number;
  end: number;
  range: number;
  result?: AudioTranscriptResult;
}

/** Regroups reliable words across contiguous transport boundaries; coarse ranges retain honest limits. */
export function reviewRecognitionPhrases(
  chunks: readonly RecognitionChunk[],
  grouping: ReviewRecognitionGrouping
): ReviewSpeechPhrase[] {
  const phrases: ReviewSpeechPhrase[] = [];
  let range = -1;
  for (const chunk of chunks) {
    if (!chunk.result) throw new Error('invalid-response');
    const incoming = reviewSpeechPhrases(chunk.result, chunk.start, chunk.end, {
      splitAtPauses: grouping === 'sentences-pauses',
    });
    for (const phrase of incoming) {
      const source = chunk.result.segments?.find(
        (entry) =>
          entry.originalText !== undefined &&
          Math.abs(entry.start + chunk.start - phrase.start) < 1e-7 &&
          Math.abs(entry.end + chunk.start - phrase.end) < 1e-7
      );
      if (source?.originalText !== undefined) phrase.originalText = source.originalText;
    }
    const last = phrases.at(-1);
    const first = incoming[0];
    if (
      range === chunk.range &&
      last?.alignment === 'word' &&
      first?.alignment === 'word' &&
      !/[.!?。！？]$/u.test(last.text) &&
      (grouping === 'sentences' || first.start - last.end < 0.45) &&
      first.start >= last.end &&
      last.text.length + first.text.length + 1 <= 16_000 &&
      (last.words?.length ?? 0) + (first.words?.length ?? 0) <= 4_000
    ) {
      phrases[phrases.length - 1] = {
        ...last,
        end: first.end,
        text: `${last.text} ${first.text}`,
        originalText: `${last.originalText} ${first.originalText}`,
        words: [...last.words!, ...first.words!],
      };
      incoming.shift();
    }
    phrases.push(...incoming);
    range = chunk.range;
  }
  return phrases.flatMap((phrase) => {
    if (phrase.text.length <= 16_000) return [phrase];
    const parts: ReviewSpeechPhrase[] = [];
    let remaining = phrase.text;
    while (remaining.length) {
      let boundary = Math.min(remaining.length, 16_000);
      if (boundary < remaining.length) {
        const whitespace = remaining.slice(0, boundary).search(/\s+\S*$/u);
        if (whitespace > 0) boundary = whitespace;
        else if (/[\uD800-\uDBFF]/u.test(remaining[boundary - 1]!)) boundary--;
      }
      const { words: _words, ...coarse } = phrase;
      const text = remaining.slice(0, boundary).trim();
      if (text)
        parts.push({
          ...coarse,
          id: crypto.randomUUID(),
          text,
          originalText: text,
          alignment: 'range',
        });
      remaining = remaining.slice(boundary).trimStart();
    }
    // Missing alignment cannot justify new per-part times; preserve the only proven range.
    return parts;
  });
}

/** Projects native phrase timing onto retained clip slices without acquiring media or writing state. */
export function recognitionFragments(
  job: { id: string; target: ReviewSpeechTarget },
  phrases: readonly ReviewSpeechPhrase[],
  slices: ReturnType<typeof projectReviewVoiceover>
): ReviewTextFragment[] {
  return phrases.flatMap<ReviewTextFragment>((phrase) => {
    const origin = {
      kind: job.target.kind,
      start: phrase.start,
      end: phrase.end,
      ...(job.target.kind === 'voiceover' ? { clipId: job.target.clipId } : {}),
      ...(phrase.words ? { words: structuredClone(phrase.words) } : {}),
    };
    const base = { ...phrase, timingRevision: 0, showInVideo: true, variantId: job.id, origin };
    if (job.target.kind === 'original') return [{ ...base, timeDomain: 'source' as const }];
    return slices.flatMap((slice) => {
      const rate = slice.playbackRate ?? 1;
      const start = Math.max(phrase.start, slice.sourceOffset);
      const end = Math.min(phrase.end, slice.sourceOffset + slice.duration * rate);
      if (end <= start) return [];
      const output = (time: number) => slice.timelineStart + (time - slice.sourceOffset) / rate;
      const words = phrase.words?.filter((word) => word.start >= start && word.end <= end);
      const aligned = phrase.alignment === 'word' && !!words?.length;
      const { words: _words, ...content } = base;
      const text = aligned ? words!.map((word) => word.text).join(' ') : phrase.text;
      return [
        {
          ...content,
          id: crypto.randomUUID(),
          start: output(start),
          end: output(end),
          text,
          originalText: aligned ? text : phrase.originalText,
          timeDomain: 'result' as const,
          alignment: aligned
            ? ('word' as const)
            : phrase.alignment === 'word'
              ? ('range' as const)
              : phrase.alignment,
          ...(words?.length
            ? {
                words: words.map((word) => ({
                  ...word,
                  start: output(word.start),
                  end: output(word.end),
                })),
              }
            : {}),
        },
      ];
    });
  });
}
