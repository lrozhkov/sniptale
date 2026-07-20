import {
  VideoAnnotationTimelineEasing,
  VideoAnnotationTimelinePhase,
  type VideoAnnotationPrimitiveValue,
  type VideoAnnotationTemplateTimeline,
  type VideoAnnotationTimelineTrack,
} from '../types';

export function track(
  id: string,
  targetNodeId: string,
  property: string,
  from: VideoAnnotationPrimitiveValue,
  to: VideoAnnotationPrimitiveValue,
  endMs: number,
  easing: VideoAnnotationTimelineEasing = VideoAnnotationTimelineEasing.EASE_OUT,
  startMs = 0
): VideoAnnotationTimelineTrack {
  return {
    id,
    keyframes: [
      { offsetMs: startMs, value: from },
      { easing, offsetMs: endMs, value: to },
    ],
    property,
    targetNodeId,
  };
}

export function createTimeline(
  durationMs: number,
  tracks: readonly VideoAnnotationTimelineTrack[]
): VideoAnnotationTemplateTimeline {
  const introDuration = Math.min(900, Math.round(durationMs * 0.34));
  const outroDuration = Math.min(420, Math.round(durationMs * 0.18));

  return {
    durationMs,
    labels: [
      { id: 'start', offsetMs: 0 },
      { id: 'reveal', offsetMs: introDuration },
      { id: 'outro', offsetMs: Math.max(introDuration, durationMs - outroDuration) },
    ],
    phases: [
      { durationMs: introDuration, id: VideoAnnotationTimelinePhase.INTRO, startMs: 0 },
      {
        durationMs: Math.max(0, durationMs - introDuration - outroDuration),
        id: VideoAnnotationTimelinePhase.IDLE,
        startMs: introDuration,
      },
      {
        durationMs: outroDuration,
        id: VideoAnnotationTimelinePhase.OUTRO,
        startMs: Math.max(introDuration, durationMs - outroDuration),
      },
    ],
    tracks: [rootOpacityTrack(durationMs, introDuration, outroDuration), ...tracks],
  };
}

function rootOpacityTrack(
  durationMs: number,
  introDuration: number,
  outroDuration: number
): VideoAnnotationTimelineTrack {
  return {
    id: 'root-opacity',
    keyframes: [
      { offsetMs: 0, value: 0.16 },
      { easing: VideoAnnotationTimelineEasing.EASE_OUT, offsetMs: introDuration, value: 1 },
      { offsetMs: Math.max(introDuration, durationMs - outroDuration), value: 1 },
      { easing: VideoAnnotationTimelineEasing.EASE_IN, offsetMs: durationMs, value: 0 },
    ],
    property: 'opacity',
    targetNodeId: 'root',
  };
}
