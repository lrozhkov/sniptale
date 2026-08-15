import { describe, expect, it } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { CaptureMode, WebcamPresentationMode } from '@sniptale/runtime-contracts/video/types/types';
import { sanitizeRecordingSettings } from './start-settings';

describe('sanitizeRecordingSettings webcam presentation', () => {
  it.each([CaptureMode.TAB, CaptureMode.TAB_CROP, CaptureMode.CAMERA, CaptureMode.SCREEN])(
    'disables the unsupported persisted diagnostics preference for %s',
    (captureMode) => {
      const settings = { ...DEFAULT_VIDEO_SETTINGS, interactionDiagnosticsEnabled: true };

      expect(sanitizeRecordingSettings(settings, captureMode).interactionDiagnosticsEnabled).toBe(
        false
      );
      expect(settings.interactionDiagnosticsEnabled).toBe(true);
    }
  );

  it.each([CaptureMode.SCREEN])(
    'uses an effective separate track for %s without mutating the saved input',
    (captureMode) => {
      const settings = {
        ...DEFAULT_VIDEO_SETTINGS,
        webcamPresentation: {
          ...DEFAULT_VIDEO_SETTINGS.webcamPresentation!,
          mode: WebcamPresentationMode.EMBEDDED,
        },
      };

      const effective = sanitizeRecordingSettings(settings, captureMode);

      expect(effective.webcamPresentation?.mode).toBe(WebcamPresentationMode.SEPARATE_TRACK);
      expect(settings.webcamPresentation.mode).toBe(WebcamPresentationMode.EMBEDDED);
    }
  );

  it.each([CaptureMode.TAB, CaptureMode.TAB_CROP])(
    'preserves embedded presentation for %s',
    (captureMode) => {
      expect(
        sanitizeRecordingSettings(DEFAULT_VIDEO_SETTINGS, captureMode).webcamPresentation?.mode
      ).toBe(WebcamPresentationMode.EMBEDDED);
    }
  );
});
