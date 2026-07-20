import {
  type VideoProject,
  type VideoProjectAudioClip,
  type VideoProjectClip,
  VideoProjectClipType,
  type VideoProjectImageClip,
  type VideoProjectVideoClip,
} from '../types/index';

function getAssetById(project: VideoProject, assetId: string) {
  return project.assets.find((asset) => asset.id === assetId);
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isVideoClip(clip: VideoProjectClip): clip is VideoProjectVideoClip {
  return clip.type === VideoProjectClipType.VIDEO;
}

function isAudioClip(clip: VideoProjectClip): clip is VideoProjectAudioClip {
  return clip.type === VideoProjectClipType.AUDIO;
}

function isMediaClip(
  clip: VideoProjectClip
): clip is VideoProjectVideoClip | VideoProjectAudioClip | VideoProjectImageClip {
  return isAudioClip(clip) || isVideoClip(clip) || clip.type === VideoProjectClipType.IMAGE;
}

export function getClipGainRange(
  clip: Pick<
    VideoProjectClip,
    'audioGainEnd' | 'audioGainStart' | 'volume' | 'volumeEnvelopeEnd' | 'volumeEnvelopeStart'
  >
): { end: number; start: number } {
  const legacyVolume = clampValue(typeof clip.volume === 'number' ? clip.volume : 1, 0, 2);
  const legacyStart =
    legacyVolume *
    clampValue(typeof clip.volumeEnvelopeStart === 'number' ? clip.volumeEnvelopeStart : 1, 0, 2);
  const legacyEnd =
    legacyVolume *
    clampValue(typeof clip.volumeEnvelopeEnd === 'number' ? clip.volumeEnvelopeEnd : 1, 0, 2);

  return {
    start: clampValue(
      typeof clip.audioGainStart === 'number' ? clip.audioGainStart : legacyStart,
      0,
      2
    ),
    end: clampValue(typeof clip.audioGainEnd === 'number' ? clip.audioGainEnd : legacyEnd, 0, 2),
  };
}

export function getClipWaveformPeaks(
  project: VideoProject,
  clip: VideoProjectClip,
  sampleCount: number
): number[] {
  if (!isMediaClip(clip) || clip.type === VideoProjectClipType.IMAGE || sampleCount <= 0) {
    return [];
  }

  const asset = getAssetById(project, clip.assetId);
  const sourcePeaks = asset?.metadata.audioPeaks;
  const assetDuration = asset?.metadata.duration ?? clip.sourceDuration;
  if (!sourcePeaks || sourcePeaks.length === 0 || !assetDuration || assetDuration <= 0) {
    return [];
  }

  const resolvedSampleCount = Math.max(8, Math.min(sampleCount, 160));
  const clipStartRatio = clampValue(clip.sourceStart / assetDuration, 0, 1);
  const clipEndRatio = clampValue(
    (clip.sourceStart + clip.sourceDuration) / assetDuration,
    clipStartRatio,
    1
  );
  const clipSpan = Math.max(clipEndRatio - clipStartRatio, 1 / sourcePeaks.length);

  return Array.from({ length: resolvedSampleCount }, (_, index) => {
    const rangeStart = clipStartRatio + (index / resolvedSampleCount) * clipSpan;
    const rangeEnd = clipStartRatio + ((index + 1) / resolvedSampleCount) * clipSpan;
    const startIndex = Math.min(
      sourcePeaks.length - 1,
      Math.floor(rangeStart * sourcePeaks.length)
    );
    const endIndex = Math.max(
      startIndex + 1,
      Math.min(sourcePeaks.length, Math.ceil(rangeEnd * sourcePeaks.length))
    );
    let peak = 0;

    for (let peakIndex = startIndex; peakIndex < endIndex; peakIndex += 1) {
      peak = Math.max(peak, sourcePeaks[peakIndex] ?? 0);
    }

    return clampValue(peak, 0, 1);
  });
}
