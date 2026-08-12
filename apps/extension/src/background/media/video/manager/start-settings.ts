import {
  CaptureMode,
  normalizeVideoSourceCount,
  WebcamPresentationMode,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

export function sanitizeRecordingSettings(
  settings: VideoRecordingSettings,
  captureMode: CaptureMode
): VideoRecordingSettings {
  const sourceCount =
    captureMode === CaptureMode.SCREEN ? normalizeVideoSourceCount(settings.sourceCount) : 1;
  return {
    ...settings,
    sourceCount,
    ...(sourceCount > 1
      ? { controlledCursorCaptureEnabled: false, systemAudioEnabled: false }
      : {}),
    ...(captureMode === CaptureMode.SCREEN
      ? {
          webcamPresentation: {
            ...(settings.webcamPresentation ?? DEFAULT_VIDEO_SETTINGS.webcamPresentation!),
            mode: WebcamPresentationMode.SEPARATE_TRACK,
          },
        }
      : {}),
    ...(captureMode === CaptureMode.CAMERA
      ? {
          controlledCursorCaptureEnabled: false,
          diagnosticsEnabled: false,
          sourceCount: 1,
          systemAudioEnabled: false,
          webcamEnabled: true,
        }
      : {}),
  };
}
