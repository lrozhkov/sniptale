import type { QuickEditAudioClip } from './advanced/types';

/**
 * Replaces native intervals after Cut/Speed projection. Generated samples start at
 * interval start, keep the clip tempo, and leave silence when shorter than the slot.
 */
export function projectReviewSpeechReplacements(clip: QuickEditAudioClip): QuickEditAudioClip[] {
  const replacements = clip.transcript?.replacements;
  if (!replacements?.length) return [clip];
  const rate = clip.playbackRate ?? 1;
  const start = clip.sourceOffset;
  const end = start + clip.duration * rate;
  const slices: QuickEditAudioClip[] = [];
  const append = (
    from: number,
    to: number,
    assetId: string,
    sourceOffset: number,
    suffix: string
  ) => {
    if (to <= from) return;
    slices.push({
      ...clip,
      id: `${clip.id}:speech:${suffix}`,
      assetId,
      sourceOffset,
      timelineStart: clip.timelineStart + (from - start) / rate,
      duration: (to - from) / rate,
      fadePhase: {
        offset: (clip.fadePhase?.offset ?? 0) + from - start,
        duration: clip.fadePhase?.duration ?? clip.duration * rate,
      },
    });
  };
  let cursor = start;
  for (const replacement of replacements) {
    if (replacement.end <= start || replacement.start >= end) continue;
    append(cursor, Math.min(end, replacement.start), clip.assetId, cursor, `original:${cursor}`);
    const from = Math.max(start, replacement.start);
    const to = Math.min(end, replacement.start + replacement.duration);
    append(from, to, replacement.assetId, from - replacement.start, replacement.id);
    cursor = Math.max(cursor, Math.min(end, replacement.end));
  }
  append(cursor, end, clip.assetId, cursor, `original:${cursor}`);
  return slices;
}
