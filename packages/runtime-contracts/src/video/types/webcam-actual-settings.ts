import type { WebcamActualSettings } from './types';

export function pickNumericWebcamActualSettings(
  trackSettings: MediaTrackSettings
): WebcamActualSettings {
  return {
    ...(typeof trackSettings.frameRate === 'number' ? { frameRate: trackSettings.frameRate } : {}),
    ...(typeof trackSettings.height === 'number' ? { height: trackSettings.height } : {}),
    ...(typeof trackSettings.width === 'number' ? { width: trackSettings.width } : {}),
  };
}
