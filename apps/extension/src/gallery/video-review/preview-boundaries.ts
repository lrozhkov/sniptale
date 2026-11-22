import type { ReviewCutTransitionPlan } from '../../features/video/review/cuts';
import { fitQuickEditZoomTransitions } from '../../features/video/review/advanced/zoom';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type { ReviewTimeSegment } from '../../features/video/review/time-segment';

interface ReviewPreviewBoundary {
  kind: 'cut' | ReviewCutTransitionPlan['type'] | 'effect-entry' | 'effect-exit';
  time: number;
  incoming?: { time: number; segmentId: string };
}

/** Locate render boundaries on the result clock and independent decode positions on the source clock. */
export function buildReviewPreviewBoundaries(
  segments: readonly ReviewTimeSegment[],
  transitions: readonly ReviewCutTransitionPlan[],
  regions: readonly QuickEditZoomRegion[]
): readonly ReviewPreviewBoundary[] {
  const boundaries: ReviewPreviewBoundary[] = [];
  for (const plan of transitions) {
    if (plan.before > 0) boundaries.push({ kind: plan.type, time: plan.seam - plan.before });
    if (plan.after > 0) boundaries.push({ kind: plan.type, time: plan.seam + plan.after });
  }
  for (let index = 1; index < segments.length; index++) {
    const previous = segments[index - 1]!;
    const next = segments[index]!;
    if (previous.kind !== 'cut' || next.kind === 'cut' || next.kind === 'freeze') continue;
    const time = next.resultStart;
    boundaries.push({
      kind: transitions.find((plan) => plan.seam === time)?.type ?? 'cut',
      time,
      incoming: { time: next.sourceStart, segmentId: `video:${index}` },
    });
  }
  for (const region of regions) {
    const { enter, exit } = fitQuickEditZoomTransitions(region, region.end - region.start);
    boundaries.push({ kind: 'effect-entry', time: region.start });
    if (enter.duration > 0)
      boundaries.push({ kind: 'effect-entry', time: region.start + enter.duration });
    if (exit.duration > 0)
      boundaries.push({ kind: 'effect-exit', time: region.end - exit.duration });
    boundaries.push({ kind: 'effect-exit', time: region.end });
  }
  return boundaries.sort((a, b) => a.time - b.time);
}

/** Find the active deadline grid when nearby cuts have overlapping preparation windows. */
export function nearestReviewCut(
  boundaries: readonly ReviewPreviewBoundary[],
  current: number,
  window: number
) {
  let nearest: ReviewPreviewBoundary | undefined;
  let distance = window;
  for (const boundary of boundaries) {
    if (!boundary.incoming) continue;
    const offset = Math.abs(boundary.time - current);
    if (offset <= distance) {
      nearest = boundary;
      distance = offset;
    } else if (boundary.time > current) break;
  }
  return nearest;
}

/** Continue the cut-aligned cadence while a deadline is reachable within the preparation window. */
export function nextReviewCutDeadline(
  current: number,
  cut: number,
  fps: number,
  lead: number,
  previous: number | null
): number | null {
  const lastCandidate = Math.floor((current + lead - cut) * fps);
  // Keep the next sample through display jitter, then catch up if half its interval has elapsed.
  const firstReachable = Math.ceil((current - cut) * fps - 0.5);
  const next =
    previous === null
      ? Math.floor((current - cut) * fps) + 1
      : Math.max(Math.floor((previous - cut) * fps + 0.000001) + 1, firstReachable);
  // Preserve the first incoming frame even if a display tick runs just past the cut.
  if (previous !== null && previous < cut && next > 0 && current < cut + 1 / fps) return cut;
  return next <= lastCandidate ? cut + next / fps : null;
}
