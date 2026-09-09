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
  // A short source-time window keeps sustained music responsive without frame-to-frame spikes.
  const sampleAt = (time: number) => {
    if (time < 0 || time >= params.assetDuration) return 0;
    const position = Math.max(0, (time / params.assetDuration) * params.peaks.length - 0.5);
    const index = Math.min(params.peaks.length - 1, Math.floor(position));
    const fraction = position - index;
    const a = params.peaks[index] ?? 0;
    const b = params.peaks[Math.min(params.peaks.length - 1, index + 1)] ?? 0;
    return a + (b - a) * fraction;
  };
  const levels = [-0.04, -0.02, 0, 0.02, 0.04].map((offset) => sampleAt(sourceTime + offset));
  return clampAudioEnvelope(
    Math.sqrt(levels.reduce((sum, level) => sum + level * level, 0) / levels.length)
  );
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

    if (project.tracks?.find((track) => track.id === clip.trackId)?.visible === false) continue;
    const level = getClipAudioEnvelope(project, clip, currentTime);
    envelope += level * level;
  }

  return clampAudioEnvelope(Math.sqrt(envelope));
}
