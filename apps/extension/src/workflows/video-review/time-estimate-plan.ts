import type { VideoProjectExportTimeEstimate } from '../../features/video/project/types/export';
import {
  createExportTimeEstimator,
  planExportTimeWork,
} from '../../features/video/project/export/time-estimate';
import type { QuickEditZoomRegion } from '../../features/video/review/advanced/types';
import type { ReviewCutTransitionPlan } from '../../features/video/review/cuts';

/** Plans result-time work, including fragment offset, without decoding probe frames. */
export function planReviewExportTime(args: {
  duration: number;
  fragmentOffset: number;
  zoomRegions: readonly QuickEditZoomRegion[];
  transitions: readonly ReviewCutTransitionPlan[];
  webcam: boolean;
}) {
  const boundaries = [0, args.duration];
  for (const region of args.zoomRegions) {
    boundaries.push(
      region.start - args.fragmentOffset,
      region.end - args.fragmentOffset,
      region.start + region.enter.duration - args.fragmentOffset,
      region.end - region.exit.duration - args.fragmentOffset
    );
  }
  for (const transition of args.transitions)
    boundaries.push(transition.seam - transition.before, transition.seam + transition.after);
  return planExportTimeWork(0, args.duration, boundaries, (time) => {
    const globalTime = time + args.fragmentOffset;
    let cost = args.webcam ? 1.5 : 1;
    for (const region of args.zoomRegions) {
      if (region.dormant || globalTime < region.start || globalTime >= region.end) continue;
      if (region.spotlight?.effect === 'blur') cost += 1;
      else if (region.spotlight || region.border) cost += 0.25;
      if (
        (region.enter.type !== 'none' && globalTime < region.start + region.enter.duration) ||
        (region.exit.type !== 'none' && globalTime > region.end - region.exit.duration)
      )
        cost += 0.25;
    }
    if (
      args.transitions.some(
        (transition) =>
          time >= transition.seam - transition.before && time < transition.seam + transition.after
      )
    )
      cost += 0.5;
    return cost;
  });
}

/** Owns this render's video/audio timing and one notification budget across all edit windows. */
export function createReviewRenderTimeTracking(
  plan: Parameters<typeof planReviewExportTime>[0],
  report: ((estimate: VideoProjectExportTimeEstimate | null) => void) | undefined,
  progress: ((fraction: number) => void) | undefined = undefined,
  now: () => number = () => performance.now()
) {
  if (!report) return undefined;
  const timeEstimator = createExportTimeEstimator(planReviewExportTime(plan), now);
  let audioStarted = now();
  let audioElapsed = 0;
  let audioSeconds = 0;
  let lastEstimateAt = -Infinity;
  return {
    startAudio() {
      audioStarted = now();
    },
    finishAudio(segment: { resultStart: number; resultEnd: number }) {
      audioElapsed += Math.max(0, now() - audioStarted);
      audioSeconds += segment.resultEnd - segment.resultStart;
      timeEstimator.setAdditionalRemainingMs(
        audioSeconds > 0
          ? (audioElapsed / audioSeconds) * Math.max(0, plan.duration - segment.resultEnd)
          : 0
      );
      timeEstimator.resume();
    },
    renderProgress(fraction: number) {
      progress?.(fraction);
      // This renderer fraction is source-independent output time, not the UI phase bands.
      const estimate = timeEstimator.observe(fraction * plan.duration);
      const current = now();
      if (current - lastEstimateAt < 500) return;
      lastEstimateAt = current;
      report?.(estimate);
    },
  };
}
