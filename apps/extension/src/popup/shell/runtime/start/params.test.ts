import { expect, it, vi } from 'vitest';

import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { createPopupStartRecordingParams } from './params';

it('keeps recording control capability setter on start handler params', () => {
  const setIsStartPending = vi.fn();
  const setRecordingControlCapability = vi.fn();
  const setStartError = vi.fn();
  const videoSettings = {
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: true,
    quality: VideoQuality.MEDIUM,
    systemAudioEnabled: true,
  };

  expect(
    createPopupStartRecordingParams({
      presets: {
        videoCaptureMode: CaptureMode.TAB,
      },
      recording: {
        setIsStartPending,
        setRecordingControlCapability,
        setStartError,
        videoSettings,
      },
    })
  ).toEqual({
    captureMode: CaptureMode.TAB,
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    videoSettings,
    viewportPreset: null,
  });
});
