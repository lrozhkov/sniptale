import { isVideoProjectUtilityLaneVisible } from '../../../project/utility-lanes';
import { getMotionAnimationTime, motionTransitionSettings } from '../../../project/motion/timing';
import type { VideoProject } from '../../../project/types';
import type { VideoCompositionBorderState } from '../../types';

/** Resolve retained interval clocks once, with explicit viewport and concrete window owners. */
export function resolveVideoCompositionBorders(project: VideoProject, time: number) {
  const viewport: VideoCompositionBorderState[] = [];
  const windows = new Map<string, VideoCompositionBorderState[]>();
  if (!isVideoProjectUtilityLaneVisible(project, 'camera')) return { viewport, windows };
  const videoIds = new Set(
    project.clips.filter((clip) => clip.type === 'VIDEO').map((clip) => clip.id)
  );
  const regions = (project.motionRegions ?? [])
    .filter(
      (region) =>
        region.border &&
        region.duration > 0 &&
        time >= region.startTime &&
        time < region.startTime + region.duration
    )
    .toSorted((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id));
  for (const region of regions) {
    const binding = region.sourceBinding;
    if (binding && !videoIds.has(binding.clipId)) continue;
    const state: VideoCompositionBorderState = {
      id: region.id,
      border: region.border!,
      ...(binding?.coordinateSpace ? { coordinateSpace: binding.coordinateSpace } : {}),
      clock: {
        time: getMotionAnimationTime(region, time - region.startTime),
        duration: region.animation?.duration ?? binding?.animation.duration ?? region.duration,
        enter: motionTransitionSettings(region, 'enter'),
        exit: motionTransitionSettings(region, 'exit'),
      },
    };
    if (region.borderTarget === 'viewport') viewport.push(state);
    else if (region.borderTarget === 'window' && binding) {
      const frames = windows.get(binding.clipId) ?? [];
      frames.push(state);
      windows.set(binding.clipId, frames);
    }
  }
  return { viewport, windows };
}
