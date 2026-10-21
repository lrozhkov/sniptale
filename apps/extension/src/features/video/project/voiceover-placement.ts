import { projectReviewVoiceoverAnchors } from '../review/voiceover-edits';
import { retimeReviewVoiceover } from '../review/voiceover-timing';
import type { QuickEditAudioClip } from '../review/advanced/types';
import type { ReviewTimeSegment } from '../review/time-segment';
import type { VideoProjectAudioClip, VideoProjectVideoClip } from './types/model';
import { normalizeClipPlaybackRate } from './timeline/rate';

type Placement = VideoProjectAudioClip | VideoProjectVideoClip;

/**
 * Projects an admitted whole take onto one current placement. The caller owns
 * binding admission and the immutable capture reference; returned slices are disposable.
 */
export function projectSourceVoiceoverPlacement(
  take: QuickEditAudioClip,
  reference: readonly ReviewTimeSegment[],
  placement: Placement
): QuickEditAudioClip[] {
  if (take.dormant || !take.sourceAnchor?.length || !reference.length) return [];
  const rate = normalizeClipPlaybackRate(placement.playbackRate ?? 1);
  const end = placement.sourceStart + Math.min(placement.sourceDuration, placement.duration * rate);
  if (end <= placement.sourceStart) return [];
  const normalized = retimeReviewVoiceover(
    take,
    occurrenceClock(reference, placement.sourceStart, end, rate)
  );
  return projectReviewVoiceoverAnchors(take, normalized.sourceAnchor ?? [], [
    {
      kind: rate === 1 ? 'keep' : 'speed',
      rate,
      sourceStart: placement.sourceStart,
      sourceEnd: end,
      resultStart: placement.startTime,
      resultEnd: placement.startTime + (end - placement.sourceStart) / rate,
    },
  ]).map((view, index) => ({
    ...view,
    id: `voice:${JSON.stringify([take.id, placement.id, index])}`,
  }));
}

function occurrenceClock(
  reference: readonly ReviewTimeSegment[],
  start: number,
  end: number,
  rate: number
): ReviewTimeSegment[] {
  const result: ReviewTimeSegment[] = [];
  let time = 0;
  for (const part of reference) {
    const points = [
      ...new Set([
        part.sourceStart,
        part.sourceEnd,
        Math.max(part.sourceStart, Math.min(part.sourceEnd, start)),
        Math.max(part.sourceStart, Math.min(part.sourceEnd, end)),
      ]),
    ].sort((left, right) => left - right);
    for (let index = 0; index < points.length - 1; index++) {
      const from = points[index]!,
        to = points[index + 1]!;
      if (to <= from) continue;
      const local = from >= start && to <= end;
      const kind = local ? (rate === 1 ? 'keep' : 'speed') : part.kind;
      const speed = local ? rate : part.rate;
      const duration = kind === 'cut' ? 0 : (to - from) / speed;
      result.push({
        kind,
        rate: speed,
        sourceStart: from,
        sourceEnd: to,
        resultStart: time,
        resultEnd: time + duration,
      });
      time += duration;
    }
  }
  return result;
}
