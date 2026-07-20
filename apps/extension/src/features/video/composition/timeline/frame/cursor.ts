import { normalizeVideoProjectCursorSkin } from '../../../project/cursor';
import type { VideoProject, VideoProjectCursorSample } from '../../../project/types/index';
import { VideoCursorCaptureMode, VideoTemporalEasing } from '../../../project/types/index';
import { applyTemporalEasing } from '../../motion/index';
import type { VideoCompositionActionState, VideoCompositionCursorState } from '../../types';

function interpolateSample(
  previousSample: VideoProjectCursorSample,
  nextSample: VideoProjectCursorSample,
  currentTime: number
): VideoProjectCursorSample {
  const duration = nextSample.time - previousSample.time;
  if (duration <= 0) {
    return previousSample;
  }

  const progress = applyTemporalEasing(
    (currentTime - previousSample.time) / duration,
    previousSample.interpolation ?? VideoTemporalEasing.LINEAR
  );

  return {
    ...previousSample,
    time: currentTime,
    visible: previousSample.visible && nextSample.visible,
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

  let previousSample = samples[0] ?? null;
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

  if (project.cursorTrack?.captureMode === VideoCursorCaptureMode.EMBEDDED_FALLBACK) {
    return previousSample;
  }

  return nextSample ? interpolateSample(previousSample, nextSample, currentTime) : previousSample;
}

function getCursorScaleBoost(actions: VideoCompositionActionState[]): number {
  return actions.some((action) => action.event.preset === 'DWELL_ZOOM') ? 1.28 : 1;
}

function resolveCursorSkin(project: VideoProject, sample: VideoProjectCursorSample) {
  return normalizeVideoProjectCursorSkin(sample.skinOverride ?? project.cursorTrack?.skin);
}

export function resolveVideoCompositionCursor(
  project: VideoProject,
  currentTime: number,
  actions: VideoCompositionActionState[]
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
    scale: skin.scale * getCursorScaleBoost(actions),
    shadow: skin.shadow,
    time: currentTime,
    visible: true,
    x: sample.x,
    y: sample.y,
  };
}
