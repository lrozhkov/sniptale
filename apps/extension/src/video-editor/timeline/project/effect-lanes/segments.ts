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
