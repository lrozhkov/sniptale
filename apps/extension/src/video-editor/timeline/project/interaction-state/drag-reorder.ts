import { planClipSwap } from '../../../project/state/clip-timeline/reorder';
import type { VideoProject, VideoProjectClip } from '../../../../features/video/project/types';
import type { TimelineClipReorderSlot } from '../types';

/** Exposes resulting leading-edge slots from the authoritative neighbor-swap plan. */
export function getTimelineReorderSlots(
  project: VideoProject,
  clip: VideoProjectClip
): TimelineClipReorderSlot[] {
  const directions = ['left', 'right'] as const;
  return directions.flatMap((direction) => {
    const plan = planClipSwap(project, clip.id, direction);
    if (plan.status !== 'ready') return [];
    const shift = plan.shifts.find((item) => item.clipIds.has(clip.id));
    if (!shift || Math.abs(shift.delta) < 1e-9) return [];
    return [
      { direction, startTime: clip.startTime + shift.delta, neighborName: plan.neighborName },
    ];
  });
}
