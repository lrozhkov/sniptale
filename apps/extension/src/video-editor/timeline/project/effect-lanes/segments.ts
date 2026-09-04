import { getVideoProjectUtilityLanes } from '../../../../features/video/project/utility-lanes';
import {
  buildVideoCompositionActionSegmentsFromEvents,
  buildVideoCompositionMotionSegmentsFromRegions,
} from '../../../../features/video/composition/timeline/lanes';
import type { VideoProject } from '../../../../features/video/project/types';

export function buildTimelineActionSegments(project: VideoProject) {
  return buildVideoCompositionActionSegmentsFromEvents(project.actionEvents);
}

export function buildTimelineMotionSegments(project: VideoProject) {
  return buildVideoCompositionMotionSegmentsFromRegions(project.motionRegions ?? []);
}

/** Keep authored data and non-default lane controls reachable, even after clearing or trimming. */
export function getTimelineUtilityRowPresence(project: VideoProject) {
  const lanes = getVideoProjectUtilityLanes(project);
  return {
    actions: project.actionEvents.length > 0 || !lanes.actions.visible || lanes.actions.locked,
    motion:
      (project.motionRegions?.length ?? 0) > 0 || !lanes.camera.visible || lanes.camera.locked,
  };
}
