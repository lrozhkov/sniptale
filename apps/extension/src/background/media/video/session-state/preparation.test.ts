import { beforeEach, expect, it, vi } from 'vitest';
import {
  CaptureMode,
  VideoQuality,
  VideoRecordingStatus,
} from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const { setVideoRecordingRuntimeState } = vi.hoisted(() => ({
  setVideoRecordingRuntimeState: vi.fn(),
}));

vi.mock('../runtime/session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/session-state')>()),
  setVideoRecordingRuntimeState,
}));

import { videoManagerSession } from '../manager/session';
import { beginVideoRecordingPreparation, resetVideoRecordingStartSession } from './preparation';

beforeEach(() => {
  vi.clearAllMocks();
  videoManagerSession.controlledCursorCaptureEnabled = true;
  videoManagerSession.controlledCursorAutoPaused = true;
  videoManagerSession.controlledCursorNavigationEpoch = 3;
  videoManagerSession.controlledCursorNavigationPending = true;
  videoManagerSession.controlledCursorOffsetSeconds = 6;
  videoManagerSession.controlledCursorTelemetry = {
    actionEvents: [],
    cursorTrack: null,
    signals: [],
    viewport: null,
  };
});

it('resets controlled cursor state when a new recording preparation begins', () => {
  beginVideoRecordingPreparation(
    CaptureMode.TAB,
    {
      ...DEFAULT_VIDEO_SETTINGS,
      autoFadeDelay: 0,
      countdownSeconds: 3,
      diagnosticsEnabled: false,
      microphoneDeviceId: 'mic-1',
      microphoneEnabled: true,
      openEditorAfterRecording: false,
      outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, quality: VideoQuality.HIGH },
      systemAudioEnabled: true,
      webcamDeviceId: 'cam-1',
      webcamEnabled: true,
    },
    null
  );

  expect(videoManagerSession.controlledCursorCaptureEnabled).toBe(false);
  expect(videoManagerSession.controlledCursorAutoPaused).toBe(false);
  expect(videoManagerSession.controlledCursorNavigationEpoch).toBe(3);
  expect(videoManagerSession.controlledCursorNavigationPending).toBe(false);
  expect(videoManagerSession.controlledCursorOffsetSeconds).toBe(0);
  expect(videoManagerSession.controlledCursorTelemetry).toBeNull();
  expect(setVideoRecordingRuntimeState).toHaveBeenCalledWith({
    status: VideoRecordingStatus.PREPARING,
    duration: 0,
    countdownEndsAt: null,
    captureMode: CaptureMode.TAB,
    captureSource: null,
    cropRegion: null,
    viewportPresetId: null,
    liveMedia: {
      microphoneDeviceId: 'mic-1',
      microphoneEnabled: true,
      microphoneSelected: true,
      webcamDeviceId: 'cam-1',
      webcamEnabled: true,
      webcamSettings: null,
      webcamSelected: true,
    },
    error: null,
  });
});

it('drops controlled cursor state when the start session is reset early', () => {
  resetVideoRecordingStartSession();

  expect(videoManagerSession.controlledCursorCaptureEnabled).toBe(false);
  expect(videoManagerSession.controlledCursorAutoPaused).toBe(false);
  expect(videoManagerSession.controlledCursorNavigationEpoch).toBe(3);
  expect(videoManagerSession.controlledCursorNavigationPending).toBe(false);
  expect(videoManagerSession.controlledCursorOffsetSeconds).toBe(0);
  expect(videoManagerSession.controlledCursorTelemetry).toBeNull();
});
