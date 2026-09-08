import { buildProjectTransitionSegments } from '../../project/transition/project';
import { isVideoProjectUtilityLaneVisible } from '../../project/utility-lanes';
import { type VideoProject } from '../../project/types/index';
import type {
  VideoCompositionCursorSegment,
  VideoCompositionMotionSegment,
  VideoCompositionTransitionSegment,
} from '../types';

export function buildVideoCompositionTransitionSegments(
  project: VideoProject
): VideoCompositionTransitionSegment[] {
  return buildProjectTransitionSegments(project);
}

export function buildVideoCompositionCursorSegments(
  project: VideoProject
): VideoCompositionCursorSegment[] {
  const samples = project.cursorTrack?.samples ?? [];
  if (samples.length === 0) {
    return [];
  }

  const primitiveSegments = samples
    .map((sample, index) => {
      const nextSample = samples[index + 1];
      return {
        end: nextSample?.time ?? project.duration,
        id: sample.id,
        sampleIds: [sample.id],
        start: sample.time,
        visible: sample.visible,
      };
    })
    .filter((segment) => segment.end > segment.start);

  return primitiveSegments.reduce<VideoCompositionCursorSegment[]>((segments, segment) => {
    const previousSegment = segments.at(-1);
    if (!previousSegment || previousSegment.visible !== segment.visible) {
      segments.push(segment);
      return segments;
    }

    previousSegment.end = segment.end;
    previousSegment.sampleIds.push(...segment.sampleIds);
    return segments;
  }, []);
}

export function buildVideoCompositionMotionSegments(
  project: VideoProject
): VideoCompositionMotionSegment[] {
  if (!isVideoProjectUtilityLaneVisible(project, 'camera')) {
    return [];
  }

  return buildVideoCompositionMotionSegmentsFromRegions(project.motionRegions ?? []);
}

export function buildVideoCompositionMotionSegmentsFromRegions(
  motionRegions: NonNullable<VideoProject['motionRegions']>
): VideoCompositionMotionSegment[] {
  return motionRegions
    .map((region) => ({
      end: region.startTime + region.duration,
      id: region.id,
      region,
      start: region.startTime,
    }))
    .filter((segment) => segment.end > segment.start);
}
