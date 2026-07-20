import {
  CaptureMode,
  normalizeVideoSourceCount,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';

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
