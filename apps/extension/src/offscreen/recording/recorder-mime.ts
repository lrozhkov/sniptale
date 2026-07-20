export const RECORDING_MIME_TYPE_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
] as const;

export const WEBM_EXPORT_MIME_TYPE_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

export function getFirstSupportedMediaRecorderMimeType(
  candidates: readonly string[],
  fallback = 'video/webm'
): string {
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return fallback;
}

export function buildVideoMediaRecorderOptions(
  settings: VideoRecordingSettings
): MediaRecorderOptions {
  const qualityKey =
    settings.quality && VIDEO_QUALITY_CONFIGS[settings.quality]
      ? settings.quality
      : VideoQuality.HIGH;
  const qualityConfig = VIDEO_QUALITY_CONFIGS[qualityKey];
  const mimeType = MediaRecorder.isTypeSupported(qualityConfig.mimeType)
    ? qualityConfig.mimeType
    : 'video/webm';

  return {
    mimeType,
    videoBitsPerSecond: qualityConfig.videoBitsPerSecond,
  };
}
import { VIDEO_QUALITY_CONFIGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
