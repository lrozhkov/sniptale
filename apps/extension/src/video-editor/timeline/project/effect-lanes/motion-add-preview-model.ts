import { resolveTimelineTimeFromClientX } from '../interaction-state/seek';
import type { MotionLaneAddPreview } from './motion-add-preview';

export function resolveMotionLaneAddPreview(args: {
  clientX: number;
  currentPreview: MotionLaneAddPreview | null;
  pixelsPerSecond: number;
  timeline: HTMLDivElement;
}): MotionLaneAddPreview | null {
  if (args.currentPreview) {
    return args.currentPreview;
  }

  const time = resolveTimelineTimeFromClientX(args.timeline, args.clientX, args.pixelsPerSecond);
  return { left: time * args.pixelsPerSecond, time };
}
