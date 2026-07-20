import {
  createAudioClipFromAsset,
  createVideoProjectTransform,
  createVideoClipFromAsset,
} from './clip';
import {
  VideoProjectAssetType,
  type VideoProjectAsset,
  type VideoProjectClip,
  type VideoProjectVideoClip,
} from '../types/index';

export function createRecordingProjectAsset(options: {
  audioPeaks?: number[] | null;
  duration: number;
  filename: string;
  hasAudio?: boolean;
  height: number;
  mimeType: string;
  recordingId: string;
  size: number;
  width: number;
}) {
  return {
    id: crypto.randomUUID(),
    type: VideoProjectAssetType.RECORDING,
    name: options.filename,
    source: { kind: 'recording', recordingId: options.recordingId },
    metadata: {
      width: options.width,
      height: options.height,
      duration: options.duration,
      mimeType: options.mimeType,
      size: options.size,
      hasAudio: options.hasAudio ?? false,
      audioPeaks: options.audioPeaks ?? null,
    },
    createdAt: Date.now(),
  } satisfies VideoProjectAsset;
}

export function createRecordingBaseClip(
  asset: VideoProjectAsset,
  options: {
    duration: number;
    height: number;
    width: number;
  },
  primaryTrackId: string,
  groupId: string | null
): VideoProjectVideoClip {
  const duration = Math.max(0.1, options.duration);
  const clip = createVideoClipFromAsset(primaryTrackId, asset, options.width, options.height, 0, {
    groupId,
    muted: asset.metadata.hasAudio,
  }) as VideoProjectVideoClip;

  clip.duration = duration;
  clip.playbackRate = 1;
  clip.sourceDuration = duration;
  clip.transform = createVideoProjectTransform(options.width, options.height, 0, 0);
  return clip;
}

export function createRecordingAudioClip(
  asset: VideoProjectAsset,
  audioTrackId: string,
  duration: number,
  groupId: string
): VideoProjectClip {
  const clip = createAudioClipFromAsset(audioTrackId, asset, 0, {
    groupId,
    muted: false,
  });
  clip.duration = duration;
  clip.playbackRate = 1;
  clip.sourceDuration = duration;
  return clip;
}
