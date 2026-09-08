import { buildVideoCompositionMotionSegmentsFromRegions } from '../../../../features/video/composition/timeline/lanes';
import type { VideoProject } from '../../../../features/video/project/types';

export function buildTimelineMotionSegments(project: VideoProject) {
  return buildVideoCompositionMotionSegmentsFromRegions(project.motionRegions ?? []);
}

/** Utility rows exclude the independently presented history row. */
export function getTimelineUtilityRowPresence(project: VideoProject) {
  return {
    motion: (project.motionRegions?.length ?? 0) > 0,
  };
}
