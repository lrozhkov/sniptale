import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import {
  VideoQuality,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

export function createTrack(stop = () => undefined) {
  return { stop };
}

export function createSettings(
  quality: VideoQuality | undefined = VideoQuality.HIGH
): VideoRecordingSettings {
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    outputProfile: {
      ...DEFAULT_VIDEO_SETTINGS.outputProfile,
      quality: quality ?? DEFAULT_VIDEO_SETTINGS.outputProfile.quality,
    },
  };
}
