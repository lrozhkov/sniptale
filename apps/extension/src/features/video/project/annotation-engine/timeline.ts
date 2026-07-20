import {
  VideoAnnotationTimelineEasing,
  VideoAnnotationTimelineExtrapolate,
  VideoAnnotationTimelinePhase,
  type VideoAnnotationPrimitiveValue,
  type VideoAnnotationTemplateTimeline,
  type VideoAnnotationTimelineKeyframe,
  type VideoAnnotationTimelineTrack,
} from './types';
import type {
  ResolvedAnnotationTimelineState,
  ResolvedAnnotationTimelineTrackState,
} from './scene';

interface AbsoluteKeyframe extends VideoAnnotationTimelineKeyframe {
  absoluteMs: number;
}

const HOLD_PHASE = 'hold';

export function resolveAnnotationTimelineState(params: {
  clipDurationSeconds: number;
  currentTime: number;
  startTime: number;
  timeline: VideoAnnotationTemplateTimeline;
}): ResolvedAnnotationTimelineState {
  const localTimeMs = Math.round((params.currentTime - params.startTime) * 1000);
  const clampedLocalTimeMs = clamp(localTimeMs, 0, resolveTimelineDurationMs(params));
  const effects = params.timeline.tracks.map((track) =>
    resolveTrackState(track, params.timeline, clampedLocalTimeMs)
  );

  return {
    effects,
    localTimeMs,
    phase: resolveTimelinePhase(params.timeline, localTimeMs),
    phaseProgress: resolveTimelinePhaseProgress(params.timeline, localTimeMs),
  };
}

function resolveTimelineDurationMs(params: {
  clipDurationSeconds: number;
  timeline: VideoAnnotationTemplateTimeline;
}): number {
  const clipDurationMs = Math.max(0, Math.round(params.clipDurationSeconds * 1000));
  return clipDurationMs > 0 ? clipDurationMs : params.timeline.durationMs;
}

function resolveTrackState(
  track: VideoAnnotationTimelineTrack,
  timeline: VideoAnnotationTemplateTimeline,
  localTimeMs: number
): ResolvedAnnotationTimelineTrackState {
  const staggerOffsetMs = Math.max(0, track.stagger?.intervalMs ?? 0) * (track.stagger?.index ?? 0);
  const trackTimeMs = localTimeMs - staggerOffsetMs;
  const keyframes = track.keyframes
    .map((keyframe) => resolveAbsoluteKeyframe(keyframe, timeline))
    .sort((left, right) => left.absoluteMs - right.absoluteMs);
  const value = interpolateKeyframes(keyframes, trackTimeMs, track.extrapolate);

  return {
    id: track.id,
    progress: resolveTrackProgress(keyframes, trackTimeMs),
    property: track.property,
    targetNodeId: track.targetNodeId,
    value,
  };
}

function resolveAbsoluteKeyframe(
  keyframe: VideoAnnotationTimelineKeyframe,
  timeline: VideoAnnotationTemplateTimeline
): AbsoluteKeyframe {
  if (keyframe.labelRef) {
    return {
      ...keyframe,
      absoluteMs: resolveLabelOffsetMs(timeline, keyframe.labelRef) + keyframe.offsetMs,
    };
  }
  if (keyframe.phase) {
    return {
      ...keyframe,
      absoluteMs: resolvePhaseStartMs(timeline, keyframe.phase) + keyframe.offsetMs,
    };
  }
  return { ...keyframe, absoluteMs: keyframe.offsetMs };
}

function interpolateKeyframes(
  keyframes: readonly AbsoluteKeyframe[],
  timeMs: number,
  extrapolate: VideoAnnotationTimelineTrack['extrapolate']
): VideoAnnotationPrimitiveValue {
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (!first || !last) {
    return null;
  }
  if (timeMs <= first.absoluteMs) {
    return extrapolate === VideoAnnotationTimelineExtrapolate.EXTEND
      ? extrapolateValue(first, keyframes[1], timeMs)
      : first.value;
  }
  if (timeMs >= last.absoluteMs) {
    return extrapolate === VideoAnnotationTimelineExtrapolate.EXTEND
      ? extrapolateValue(keyframes[keyframes.length - 2], last, timeMs)
      : last.value;
  }

  const nextIndex = keyframes.findIndex((keyframe) => keyframe.absoluteMs >= timeMs);
  const previous = keyframes[Math.max(0, nextIndex - 1)];
  const next = keyframes[nextIndex];
  if (!previous || !next) {
    return last.value;
  }
  return interpolateValue(previous, next, timeMs, false);
}

function extrapolateValue(
  previous: AbsoluteKeyframe | undefined,
  next: AbsoluteKeyframe | undefined,
  timeMs: number
): VideoAnnotationPrimitiveValue {
  if (!previous || !next) {
    return previous?.value ?? next?.value ?? null;
  }
  return interpolateValue(previous, next, timeMs, true);
}

function interpolateValue(
  previous: AbsoluteKeyframe,
  next: AbsoluteKeyframe,
  timeMs: number,
  shouldClampProgress: boolean
): VideoAnnotationPrimitiveValue {
  if (typeof previous.value !== 'number' || typeof next.value !== 'number') {
    return timeMs < next.absoluteMs ? previous.value : next.value;
  }

  const durationMs = next.absoluteMs - previous.absoluteMs;
  const rawProgress = durationMs <= 0 ? 1 : (timeMs - previous.absoluteMs) / durationMs;
  const easedProgress = shouldClampProgress ? clamp(rawProgress, 0, 1) : rawProgress;
  const progress = applyEasing(easedProgress, next.easing ?? previous.easing);
  return previous.value + (next.value - previous.value) * progress;
}

function applyEasing(progress: number, easing: VideoAnnotationTimelineKeyframe['easing']): number {
  switch (easing) {
    case VideoAnnotationTimelineEasing.EASE_IN:
      return progress * progress;
    case VideoAnnotationTimelineEasing.EASE_OUT:
      return 1 - (1 - progress) * (1 - progress);
    case VideoAnnotationTimelineEasing.EASE_IN_OUT:
      return progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
    case VideoAnnotationTimelineEasing.SPRING:
      return clamp(1 - Math.cos(progress * Math.PI * 4) * Math.exp(-progress * 6), 0, 1);
    case VideoAnnotationTimelineEasing.LINEAR:
    case undefined:
      return progress;
  }
}

function resolveTrackProgress(keyframes: readonly AbsoluteKeyframe[], timeMs: number): number {
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (!first || !last || first.absoluteMs === last.absoluteMs) {
    return 1;
  }
  return clamp((timeMs - first.absoluteMs) / (last.absoluteMs - first.absoluteMs), 0, 1);
}

function resolveTimelinePhase(
  timeline: VideoAnnotationTemplateTimeline,
  localTimeMs: number
): ResolvedAnnotationTimelineState['phase'] {
  if (localTimeMs < 0) {
    return 'before';
  }
  const phase = timeline.phases.find(
    (candidate) =>
      localTimeMs >= candidate.startMs && localTimeMs < candidate.startMs + candidate.durationMs
  );
  if (phase) {
    return phase.id === VideoAnnotationTimelinePhase.IDLE ? HOLD_PHASE : phase.id;
  }
  return localTimeMs > timeline.durationMs ? 'after' : HOLD_PHASE;
}

function resolveTimelinePhaseProgress(
  timeline: VideoAnnotationTemplateTimeline,
  localTimeMs: number
): number {
  const phase = timeline.phases.find(
    (candidate) =>
      localTimeMs >= candidate.startMs && localTimeMs < candidate.startMs + candidate.durationMs
  );
  if (!phase || phase.durationMs <= 0) {
    return localTimeMs < 0 ? 0 : 1;
  }
  return clamp((localTimeMs - phase.startMs) / phase.durationMs, 0, 1);
}

function resolveLabelOffsetMs(timeline: VideoAnnotationTemplateTimeline, labelRef: string): number {
  return timeline.labels.find((label) => label.id === labelRef)?.offsetMs ?? 0;
}

function resolvePhaseStartMs(
  timeline: VideoAnnotationTemplateTimeline,
  phase: VideoAnnotationTimelinePhase
): number {
  return timeline.phases.find((range) => range.id === phase)?.startMs ?? 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
