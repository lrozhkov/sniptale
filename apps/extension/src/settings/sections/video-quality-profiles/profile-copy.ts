import { translate } from '../../../platform/i18n';
import {
  VideoOutputCodec,
  VideoOutputContainer,
  VideoQuality,
  VideoRecordingBuiltInProfileId,
  VideoResolutionPreset,
  type VideoRecordingQualityProfile,
} from '@sniptale/runtime-contracts/video/types/types';

export function getProfileName(profile: VideoRecordingQualityProfile): string {
  switch (profile.id) {
    case VideoRecordingBuiltInProfileId.COMPACT:
      return translate('settings.videoQuality.compactName');
    case VideoRecordingBuiltInProfileId.OPTIMAL:
      return translate('settings.videoQuality.optimalName');
    case VideoRecordingBuiltInProfileId.HIGH:
      return translate('settings.videoQuality.highName');
    case VideoRecordingBuiltInProfileId.MAXIMUM:
      return translate('settings.videoQuality.maximumName');
    default:
      return profile.name;
  }
}

export function getQualityLabel(quality: VideoQuality): string {
  const keys = {
    [VideoQuality.LOW]: 'settings.videoQuality.qualityLow',
    [VideoQuality.MEDIUM]: 'settings.videoQuality.qualityMedium',
    [VideoQuality.HIGH]: 'settings.videoQuality.qualityHigh',
    [VideoQuality.ULTRA]: 'settings.videoQuality.qualityUltra',
  } as const;
  return translate(keys[quality]);
}

export function getContainerLabel(container: VideoOutputContainer): string {
  return container === VideoOutputContainer.WEBM ? 'WebM' : 'MP4';
}

export function getCodecLabel(codec: VideoOutputCodec): string {
  switch (codec) {
    case VideoOutputCodec.AVC:
      return 'H.264 (AVC)';
    case VideoOutputCodec.VP8:
      return 'VP8';
    case VideoOutputCodec.VP9:
      return 'VP9';
  }
}

export function getResolutionLabel(resolution: VideoResolutionPreset): string {
  if (resolution === VideoResolutionPreset.SOURCE) {
    return translate('settings.videoQuality.resolutionSource');
  }
  if (resolution === VideoResolutionPreset.P1440) {
    return '1440p (2K)';
  }
  if (resolution === VideoResolutionPreset.P2160) {
    return '2160p (4K)';
  }
  return resolution.toLowerCase();
}

export function getProfileSummary(profile: VideoRecordingQualityProfile): string {
  return [
    getResolutionLabel(profile.output.resolution),
    getContainerLabel(profile.output.container),
    getCodecLabel(profile.output.codec),
    getQualityLabel(profile.quality),
  ].join(' · ');
}
