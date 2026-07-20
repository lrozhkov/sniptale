import {
  getClipCompositeAudioGain,
  getMediaClipSourceTime,
  isAudioClip,
  isClipActiveAtTime,
  isVideoClip,
} from '../timeline';
import type {
  VideoProject,
  VideoProjectAudioClip,
  VideoProjectClip,
  VideoProjectVideoClip,
} from '../types/index';

function clampAudioEnvelope(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function isAudiblePeakClip(
  clip: VideoProjectClip
): clip is VideoProjectAudioClip | VideoProjectVideoClip {
  return isAudioClip(clip) || isVideoClip(clip);
}

function getClipPeakValue(params: {
  assetDuration: number;
  currentTime: number;
  clip: VideoProjectAudioClip | VideoProjectVideoClip;
  peaks: readonly number[];
}): number {
  const sourceTime = getMediaClipSourceTime(params.clip, params.currentTime);
  const ratio = clampAudioEnvelope(sourceTime / params.assetDuration);
  const index = Math.min(params.peaks.length - 1, Math.floor(ratio * params.peaks.length));
  const current = params.peaks[index] ?? 0;
  const previous = params.peaks[Math.max(0, index - 1)] ?? 0;
  const next = params.peaks[Math.min(params.peaks.length - 1, index + 1)] ?? 0;
  const localAverage = (previous + current + next) / 3;
  const baseline = getPeakBaseline(params.peaks, index);
  const transientLift = current - Math.max(previous, next, baseline * 0.82);

  if (current < 0.55 || transientLift < 0.16) {
    return 0;
  }

  return clampAudioEnvelope((localAverage * 0.45 + transientLift * 0.95) * 1.35);
}

function getPeakBaseline(peaks: readonly number[], index: number): number {
  const start = Math.max(0, index - 4);
  const end = Math.min(peaks.length, index + 5);
  const window = peaks.slice(start, end);
  if (window.length === 0) {
    return 0;
  }

  return window.reduce((sum, peak) => sum + peak, 0) / window.length;
}

function getClipAudioEnvelope(
  project: VideoProject,
  clip: VideoProjectAudioClip | VideoProjectVideoClip,
  currentTime: number
): number {
  const asset = project.assets.find((candidate) => candidate.id === clip.assetId);
  const peaks = asset?.metadata.audioPeaks;
  const duration = asset?.metadata.duration ?? clip.sourceDuration;
  if (!peaks || peaks.length === 0 || !duration || duration <= 0) {
    return 0;
  }

  const peak = getClipPeakValue({ assetDuration: duration, clip, currentTime, peaks });
  return clampAudioEnvelope(peak * getClipCompositeAudioGain(project, clip, currentTime));
}

export function resolveSceneBackgroundAudioEnvelope(
  project: VideoProject,
  currentTime: number
): number {
  let envelope = 0;

  const clips = Array.isArray(project.clips) ? project.clips : [];
  for (const clip of clips) {
    if (!isAudiblePeakClip(clip) || !isClipActiveAtTime(clip, currentTime)) {
      continue;
    }

    envelope = Math.max(envelope, getClipAudioEnvelope(project, clip, currentTime));
  }

  return envelope;
}
