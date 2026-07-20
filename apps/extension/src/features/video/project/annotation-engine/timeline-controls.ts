import {
  VideoAnnotationControlBindingKind,
  type VideoAnnotationPrimitiveValue,
  type VideoAnnotationTemplate,
  type VideoAnnotationTemplateTimeline,
  type VideoAnnotationTimelineEasing,
  type VideoAnnotationTimelineKeyframe,
  type VideoAnnotationTimelinePhaseRange,
  type VideoAnnotationTimelineTrack,
} from './types';
import type { AnnotationSceneResolvableClip } from './scene';
import { resolveAnnotationControlValues } from './control-values';

export function resolveTemplateTimeline(params: {
  clip: AnnotationSceneResolvableClip;
  template: VideoAnnotationTemplate;
}): VideoAnnotationTemplateTimeline {
  const values = resolveAnnotationControlValues(params.template, params.clip);
  return params.template.controls.reduce((timeline, control) => {
    if (control.binding.kind !== VideoAnnotationControlBindingKind.TIMELINE_PROPERTY) {
      return timeline;
    }
    const value = values[control.id] ?? control.defaultValue;
    if (control.binding.field === 'durationMs' && typeof value === 'number') {
      return scaleTimeline(timeline, value);
    }
    if (control.binding.field === 'easing' && isTimelineEasing(value)) {
      return applyTimelineEasing(timeline, value, control.binding.trackIds);
    }
    return timeline;
  }, params.template.timeline);
}

function scaleTimeline(
  timeline: VideoAnnotationTemplateTimeline,
  durationMs: number
): VideoAnnotationTemplateTimeline {
  const safeDurationMs = Math.max(100, Math.round(durationMs));
  const factor = safeDurationMs / timeline.durationMs;

  return {
    durationMs: safeDurationMs,
    labels: timeline.labels.map((label) => ({
      ...label,
      offsetMs: Math.round(label.offsetMs * factor),
    })),
    phases: timeline.phases.map((phase) => scalePhase(phase, factor)),
    tracks: timeline.tracks.map((track) => scaleTrack(track, factor)),
  };
}

function scalePhase(
  phase: VideoAnnotationTimelinePhaseRange,
  factor: number
): VideoAnnotationTimelinePhaseRange {
  return {
    ...phase,
    durationMs: Math.round(phase.durationMs * factor),
    startMs: Math.round(phase.startMs * factor),
  };
}

function scaleTrack(
  track: VideoAnnotationTimelineTrack,
  factor: number
): VideoAnnotationTimelineTrack {
  return {
    ...track,
    keyframes: track.keyframes.map((keyframe) => scaleKeyframe(keyframe, factor)),
    ...(track.stagger
      ? { stagger: { ...track.stagger, intervalMs: Math.round(track.stagger.intervalMs * factor) } }
      : {}),
  };
}

function scaleKeyframe(
  keyframe: VideoAnnotationTimelineKeyframe,
  factor: number
): VideoAnnotationTimelineKeyframe {
  return { ...keyframe, offsetMs: Math.round(keyframe.offsetMs * factor) };
}

function applyTimelineEasing(
  timeline: VideoAnnotationTemplateTimeline,
  easing: VideoAnnotationTimelineEasing,
  trackIds: readonly string[] | undefined
): VideoAnnotationTemplateTimeline {
  const targetTrackIds = new Set(trackIds ?? timeline.tracks.map((track) => track.id));
  return {
    ...timeline,
    tracks: timeline.tracks.map((track) =>
      targetTrackIds.has(track.id) ? applyTrackEasing(track, easing) : track
    ),
  };
}

function applyTrackEasing(
  track: VideoAnnotationTimelineTrack,
  easing: VideoAnnotationTimelineEasing
): VideoAnnotationTimelineTrack {
  return {
    ...track,
    keyframes: track.keyframes.map((keyframe, index) =>
      index === 0 ? keyframe : { ...keyframe, easing }
    ),
  };
}

function isTimelineEasing(
  value: VideoAnnotationPrimitiveValue
): value is VideoAnnotationTimelineEasing {
  return (
    value === 'easeIn' ||
    value === 'easeInOut' ||
    value === 'easeOut' ||
    value === 'linear' ||
    value === 'spring'
  );
}
