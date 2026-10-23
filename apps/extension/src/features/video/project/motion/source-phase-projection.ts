import type { CameraTransition, CameraTransitionType } from './transitions';

/** A visible source interval and its playback clock, in source order. */
export interface SourceFocusSpan {
  sourceStart: number;
  sourceEnd: number;
  start: number;
  end: number;
  rate: number;
}

/** Projects fitted source phases through visible intervals without replaying phases at cuts. */
export function projectSourceFocusPhases<T extends CameraTransitionType>(
  focus: {
    sourceStart: number;
    sourceEnd: number;
    enter: CameraTransition<T>;
    exit: CameraTransition<T>;
  },
  visible: readonly SourceFocusSpan[],
  options: { splitAtRates?: boolean } = {}
): (SourceFocusSpan & {
  enter: CameraTransition<T | 'none'>;
  exit: CameraTransition<T | 'none'>;
})[] {
  const resultDuration = (start: number, end: number) =>
    visible.reduce(
      (duration, part) =>
        duration +
        Math.max(0, Math.min(end, part.sourceEnd) - Math.max(start, part.sourceStart)) / part.rate,
      0
    );
  const spans: SourceFocusSpan[] = [];
  for (const part of visible) {
    const sourceStart = Math.max(focus.sourceStart, part.sourceStart);
    const sourceEnd = Math.min(focus.sourceEnd, part.sourceEnd);
    if (sourceEnd <= sourceStart) continue;
    const start = part.start + (sourceStart - part.sourceStart) / part.rate;
    const end = part.start + (sourceEnd - part.sourceStart) / part.rate;
    const previous = spans.at(-1);
    // Source and result boundaries both must touch; a timeline gap is not a held phase.
    if (
      !options.splitAtRates &&
      previous &&
      Math.abs(previous.sourceEnd - sourceStart) < 0.000001 &&
      Math.abs(previous.end - start) < 0.000001
    ) {
      previous.end = end;
      previous.sourceEnd = sourceEnd;
    } else spans.push({ start, end, sourceStart, sourceEnd, rate: part.rate });
  }
  return spans.map((span) => ({
    ...span,
    enter:
      span.sourceStart > focus.sourceStart
        ? { type: 'none', duration: 0 }
        : {
            ...focus.enter,
            duration: resultDuration(
              focus.sourceStart,
              Math.min(span.sourceEnd, focus.sourceStart + focus.enter.duration)
            ),
          },
    exit:
      span.sourceEnd < focus.sourceEnd
        ? { type: 'none', duration: 0 }
        : {
            ...focus.exit,
            duration: resultDuration(
              Math.max(span.sourceStart, focus.sourceEnd - focus.exit.duration),
              focus.sourceEnd
            ),
          },
  }));
}
