import type { QuickEditAudioClip, QuickEditVoiceoverAnchor } from './advanced/types';
import type { ReviewTimeSegment } from './timeline';

/** Native sample seconds between source positions; cut footprints remain recoverable at 1x. */
export function reviewVoiceoverSampleDelta(
  from: number,
  to: number,
  tempo: number,
  map?: readonly ReviewTimeSegment[]
): number {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  let samples = end - start;
  for (const part of map ?? []) {
    if (part.kind !== 'speed') continue;
    const overlap = Math.max(0, Math.min(end, part.sourceEnd) - Math.max(start, part.sourceStart));
    samples += overlap / part.rate - overlap;
  }
  return samples * tempo * (to < from ? -1 : 1);
}

/** Inverts native sample displacement across Speed boundaries for explicit audio edge extension. */
export function reviewVoiceoverSourceAtOffset(
  start: number,
  samples: number,
  tempo: number,
  map?: readonly ReviewTimeSegment[]
): number {
  const direction = samples < 0 ? -1 : 1;
  let remaining = Math.abs(samples);
  let source = start;
  while (remaining > 0) {
    const part = map?.find((segment) =>
      direction > 0
        ? source >= segment.sourceStart && source < segment.sourceEnd
        : source > segment.sourceStart && source <= segment.sourceEnd
    );
    if (!part) return source + (direction * remaining) / tempo;
    const rate = part.kind === 'speed' ? part.rate : 1;
    const boundary = direction > 0 ? part.sourceEnd : part.sourceStart;
    const capacity = (Math.abs(boundary - source) * tempo) / rate;
    if (remaining < capacity) return source + (direction * remaining * rate) / tempo;
    source = boundary;
    remaining -= capacity;
  }
  return source;
}

/**
 * Projects native audio samples onto the current source-video axis at the clip's
 * own tempo. Obsolete creation-Speed boundaries merge; authored source gaps stay.
 * Cuts retain a native-time footprint so hidden samples remain recoverable.
 */
export function retimeReviewVoiceover(
  clip: QuickEditAudioClip,
  map?: readonly ReviewTimeSegment[]
): QuickEditAudioClip {
  if (!clip.sourceAnchor || !map?.length || clip.dormant) return clip;
  const tempo = clip.tempo ?? 1;
  const groups: QuickEditVoiceoverAnchor[] = [];
  for (const anchor of clip.sourceAnchor) {
    const previous = groups.at(-1);
    if (previous && Math.abs(previous.end - anchor.start) < 1e-7) {
      previous.end = anchor.end;
      previous.duration += anchor.duration;
    } else groups.push({ ...anchor });
  }
  const anchors: QuickEditVoiceoverAnchor[] = [];
  let previousEnd: number | undefined;
  for (const [index, group] of groups.entries()) {
    let source =
      previousEnd === undefined ? group.start : previousEnd + group.start - groups[index - 1]!.end;
    let offset = group.offset;
    let remaining = group.duration;
    while (remaining > 1e-7) {
      const part = map.find(
        (segment) => source >= segment.sourceStart && source < segment.sourceEnd
      );
      const rate = part?.kind === 'speed' ? part.rate : 1;
      const capacity = part ? ((part.sourceEnd - source) * tempo) / rate : remaining;
      const duration = Math.min(remaining, capacity);
      const end =
        part && remaining >= capacity ? part.sourceEnd : source + (duration * rate) / tempo;
      anchors.push({ start: source, end, offset, duration });
      source = end;
      offset += duration;
      remaining -= duration;
    }
    previousEnd = source;
  }
  return { ...clip, timelineStart: anchors[0]!.start, sourceAnchor: anchors };
}
