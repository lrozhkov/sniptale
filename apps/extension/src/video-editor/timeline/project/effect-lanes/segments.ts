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

/** Zoom rows follow authored regions; action controls remain reachable when configured. */
export function getTimelineUtilityRowPresence(project: VideoProject) {
  const lanes = getVideoProjectUtilityLanes(project);
  return {
    actions: project.actionEvents.length > 0 || !lanes.actions.visible || lanes.actions.locked,
    motion: (project.motionRegions?.length ?? 0) > 0,
  };
}
