import { normalizeVideoProjectCursorSkin } from '../../../project/cursor';
import { resolveVideoProjectActionOccurrences } from '../../../project/action-occurrences';
import type { VideoProject, VideoProjectCursorSample } from '../../../project/types/index';
import { VideoCursorCaptureMode, VideoTemporalEasing } from '../../../project/types/index';
import { applyTemporalEasing } from '../../motion/index';
import type { VideoCompositionActionState, VideoCompositionCursorState } from '../../types';

/** Evaluates the retained easing curve between two cursor keys. */
export function interpolateCursorSample(
  previousSample: VideoProjectCursorSample,
  nextSample: VideoProjectCursorSample,
  currentTime: number
): VideoProjectCursorSample {
  const duration = nextSample.time - previousSample.time;
  if (duration <= 0) {
    return previousSample;
  }

  const easing = previousSample.interpolation ?? VideoTemporalEasing.LINEAR;
  const range = previousSample.interpolationRange ?? { start: 0, end: 1 };
  const start = applyTemporalEasing(range.start, easing);
  const end = applyTemporalEasing(range.end, easing);
  const value = applyTemporalEasing(
    range.start + ((currentTime - previousSample.time) / duration) * (range.end - range.start),
    easing
  );
  const progress = end > start ? (value - start) / (end - start) : 0;

  return {
    ...previousSample,
    time: currentTime,
    visible: previousSample.visible,
    x: previousSample.x + (nextSample.x - previousSample.x) * progress,
    y: previousSample.y + (nextSample.y - previousSample.y) * progress,
  };
}

export function resolveCursorSample(
  project: VideoProject,
  currentTime: number
): VideoProjectCursorSample | null {
  const samples = project.cursorTrack?.samples ?? [];
  if (samples.length === 0) {
    return null;
  }

  let previousSample: VideoProjectCursorSample | null = null;
  let nextSample: VideoProjectCursorSample | null = null;

  for (const sample of samples) {
    if (sample.time <= currentTime) {
      previousSample = sample;
      continue;
    }

    nextSample = sample;
    break;
  }

  if (!previousSample) {
    return null;
  }
  if (previousSample.sourceAnchor) {
    const owner = project.clips.find(({ id }) => id === previousSample.sourceAnchor?.sourceClipId);
    if (!owner || currentTime < owner.startTime || currentTime >= owner.startTime + owner.duration)
      return null;
  }

  if (project.cursorTrack?.captureMode === VideoCursorCaptureMode.EMBEDDED_FALLBACK) {
    return previousSample;
  }

  return nextSample
    ? interpolateCursorSample(previousSample, nextSample, currentTime)
    : previousSample;
}

function resolveCursorSkin(project: VideoProject, sample: VideoProjectCursorSample) {
  return normalizeVideoProjectCursorSkin(sample.skinOverride ?? project.cursorTrack?.skin);
}

export function resolveVideoCompositionCursor(
  project: VideoProject,
  currentTime: number,
  _actions: VideoCompositionActionState[]
): VideoCompositionCursorState | null {
  const cursorTrack = project.cursorTrack;
  if (!cursorTrack) {
    return null;
  }

  const sample = resolveCursorSample(project, currentTime);
  if (!sample || !sample.visible) {
    return null;
  }

  const skin = resolveCursorSkin(project, sample);
  if (skin.hidden) {
    return null;
  }

  return {
    animationPreset: skin.animationPreset,
    captureMode: cursorTrack.captureMode,
    color: skin.color,
    preset: skin.preset,
    scale:
      skin.scale *
      (skin.animationPreset === 'PRESS' ? resolveClickPressScale(project, currentTime) : 1),
    shadow: skin.shadow,
    time: currentTime,
    visible: true,
    x: sample.x,
    y: sample.y,
  };
}

/** Feedback is tied to an actual click, never an idle oscillation or zoom region. */
function resolveClickPressScale(project: VideoProject, currentTime: number): number {
  const click = resolveVideoProjectActionOccurrences(project).find(
    (item) =>
      item.event.kind === 'CLICK' && currentTime >= item.time && currentTime < item.time + 0.25
  );
  return click ? 1 - 0.18 * Math.sin(((currentTime - click.time) / 0.25) * Math.PI) : 1;
}
