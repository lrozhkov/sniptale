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
import {
  beginVideoRecordingPreparation,
  clearVideoRecordingOffscreenStartDispatched,
  markVideoRecordingOffscreenStartDispatched,
  markVideoRecordingPreparationSettled,
  resetVideoRecordingStartSession,
  restoreVideoRecordingOffscreenStartPending,
} from './preparation';

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
      interactionDiagnosticsEnabled: false,
      microphoneDeviceId: 'mic-1',
      microphoneEnabled: true,
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
    outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile, quality: VideoQuality.HIGH },
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

it('retains the admitted quality when recording defaults change later', () => {
  const settings = {
    ...DEFAULT_VIDEO_SETTINGS,
    outputProfile: { ...DEFAULT_VIDEO_SETTINGS.outputProfile },
  };
  beginVideoRecordingPreparation(CaptureMode.TAB, settings, null);
  const admitted = setVideoRecordingRuntimeState.mock.calls[0]?.[0];
  const frameRate = settings.outputProfile.frameRate;
  settings.outputProfile.frameRate = 24;
  expect(admitted.outputProfile.frameRate).toBe(frameRate);
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

it('tracks offscreen preparation through dispatch, restoration and settlement', () => {
  beginVideoRecordingPreparation(CaptureMode.TAB, DEFAULT_VIDEO_SETTINGS, null);
  expect(videoManagerSession.isStarting).toBe(true);
  expect(videoManagerSession.offscreenStartDispatched).toBe(false);
  markVideoRecordingOffscreenStartDispatched();
  expect(videoManagerSession.offscreenStartDispatched).toBe(true);
  clearVideoRecordingOffscreenStartDispatched();
  expect(videoManagerSession.offscreenStartDispatched).toBe(false);
  restoreVideoRecordingOffscreenStartPending();
  expect(videoManagerSession.isStarting).toBe(true);
  expect(videoManagerSession.offscreenStartDispatched).toBe(true);
  markVideoRecordingPreparationSettled();
  expect(videoManagerSession.isStarting).toBe(false);
  expect(videoManagerSession.offscreenStartDispatched).toBe(false);
});
