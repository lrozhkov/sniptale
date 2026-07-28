import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const { setVideoRecordingRuntimeState } = vi.hoisted(() => ({
  setVideoRecordingRuntimeState: vi.fn(),
}));

vi.mock('../runtime/session-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/session-state')>()),
  setVideoRecordingRuntimeState,
}));

import {
  beginVideoRecordingPreparation,
  beginVideoRecordingStop,
  finishVideoRecordingStop,
  getVideoRecordingCaptureMode,
  getVideoRecordingCountdownSessionId,
  getVideoRecordingId,
  getVideoRecordingTabId,
  hasActiveVideoRecordingTab,
  isVideoRecordingPreparationInProgress,
  isVideoRecordingStopInProgress,
  markVideoRecordingPreparationSettled,
  resetVideoRecordingStartSession,
  resetCompletedVideoRecordingSession,
  setVideoRecordingCountdownSessionId,
  setVideoRecordingId,
  setVideoRecordingTabId,
} from './index';
import { videoManagerSession } from '../manager/session';

function resetSession(): void {
  vi.clearAllMocks();
  videoManagerSession.recordingTabId = 11;
  videoManagerSession.currentRecordingId = 'recording-1';
  videoManagerSession.isStarting = false;
  videoManagerSession.isStopping = false;
  videoManagerSession.currentCaptureMode = null;
  videoManagerSession.currentCountdownSessionId = null;
}

beforeEach(resetSession);

it('enters PREPARING state for a new start', () => {
  beginVideoRecordingPreparation(CaptureMode.TAB, DEFAULT_VIDEO_SETTINGS, 'wide');

  expect(videoManagerSession.isStarting).toBe(true);
  expect(videoManagerSession.currentCaptureMode).toBe(CaptureMode.TAB);
  expect(setVideoRecordingRuntimeState).toHaveBeenCalledWith({
    status: VideoRecordingStatus.PREPARING,
    duration: 0,
    countdownEndsAt: null,
    captureMode: CaptureMode.TAB,
    captureSource: null,
    cropRegion: null,
    viewportPresetId: 'wide',
    liveMedia: expect.any(Object),
    error: null,
  });
});

it('resets start bindings while preserving the active recording id', () => {
  videoManagerSession.isStarting = true;
  videoManagerSession.currentCaptureMode = CaptureMode.TAB;
  videoManagerSession.currentCountdownSessionId = 'countdown-1';

  resetVideoRecordingStartSession();

  expect(videoManagerSession.isStarting).toBe(false);
  expect(videoManagerSession.recordingTabId).toBeNull();
  expect(videoManagerSession.currentCaptureMode).toBeNull();
  expect(videoManagerSession.currentCountdownSessionId).toBeNull();
  expect(videoManagerSession.currentRecordingId).toBe('recording-1');
});

it('captures stop context and resets start state before stopping', () => {
  videoManagerSession.isStarting = true;
  videoManagerSession.currentCaptureMode = CaptureMode.TAB;
  videoManagerSession.currentCountdownSessionId = 'countdown-2';

  const context = beginVideoRecordingStop();

  expect(context).toEqual({
    tabId: 11,
    mode: CaptureMode.TAB,
    shouldResetImmediately: true,
  });
  expect(videoManagerSession.isStopping).toBe(true);
  expect(videoManagerSession.isStarting).toBe(false);
  expect(videoManagerSession.recordingTabId).toBeNull();
  expect(videoManagerSession.currentCaptureMode).toBeNull();
  expect(videoManagerSession.currentCountdownSessionId).toBeNull();
});

it('returns a deferred-reset stop context when no start session is active', () => {
  videoManagerSession.currentCaptureMode = CaptureMode.SCREEN;
  videoManagerSession.isStarting = false;
  videoManagerSession.currentCountdownSessionId = null;

  const context = beginVideoRecordingStop();

  expect(context).toEqual({
    tabId: 11,
    mode: CaptureMode.SCREEN,
    shouldResetImmediately: false,
  });
  expect(videoManagerSession.isStopping).toBe(true);
  expect(videoManagerSession.recordingTabId).toBe(11);
  expect(videoManagerSession.currentCaptureMode).toBe(CaptureMode.SCREEN);
});

it('keeps stop in the early-reset path while offscreen bootstrap is still starting', () => {
  videoManagerSession.currentCaptureMode = CaptureMode.TAB_CROP;
  videoManagerSession.isStarting = true;
  videoManagerSession.currentCountdownSessionId = null;

  const context = beginVideoRecordingStop();

  expect(context).toEqual({
    tabId: 11,
    mode: CaptureMode.TAB_CROP,
    shouldResetImmediately: true,
  });
  expect(videoManagerSession.isStopping).toBe(true);
});

it('defers reset after offscreen start dispatch so stop can terminate delayed activation', () => {
  videoManagerSession.currentCaptureMode = CaptureMode.TAB_CROP;
  videoManagerSession.isStarting = true;
  (
    videoManagerSession as typeof videoManagerSession & { offscreenStartDispatched: boolean }
  ).offscreenStartDispatched = true;

  const context = beginVideoRecordingStop();

  expect(context).toEqual({
    tabId: 11,
    mode: CaptureMode.TAB_CROP,
    shouldResetImmediately: false,
  });
  expect(videoManagerSession.isStopping).toBe(true);
});

it('updates stop/start bookkeeping through the dedicated setters', () => {
  markVideoRecordingPreparationSettled();
  setVideoRecordingCountdownSessionId('countdown-3');
  setVideoRecordingId('recording-2');
  setVideoRecordingTabId(22);
  finishVideoRecordingStop();

  expect(videoManagerSession.isStarting).toBe(false);
  expect(videoManagerSession.currentCountdownSessionId).toBe('countdown-3');
  expect(videoManagerSession.currentRecordingId).toBe('recording-2');
  expect(videoManagerSession.recordingTabId).toBe(22);
  expect(videoManagerSession.isStopping).toBe(false);
});

it('clears completed recording activity without clearing a newer recording id', () => {
  videoManagerSession.currentRecordingId = 'recording-1';
  videoManagerSession.currentCaptureMode = CaptureMode.TAB;
  videoManagerSession.currentCountdownSessionId = 'countdown-3';
  videoManagerSession.recordingTabId = 22;

  resetCompletedVideoRecordingSession('recording-2');

  expect(videoManagerSession.currentRecordingId).toBe('recording-1');
  expect(videoManagerSession.currentCaptureMode).toBe(CaptureMode.TAB);
  expect(videoManagerSession.recordingTabId).toBe(22);

  resetCompletedVideoRecordingSession('recording-1');

  expect(videoManagerSession.currentRecordingId).toBeNull();
  expect(videoManagerSession.currentCaptureMode).toBeNull();
  expect(videoManagerSession.currentCountdownSessionId).toBeNull();
  expect(videoManagerSession.recordingTabId).toBeNull();
});

it('exposes session reads through dedicated helpers', () => {
  expect(getVideoRecordingTabId()).toBe(11);
  expect(getVideoRecordingId()).toBe('recording-1');
  expect(getVideoRecordingCaptureMode()).toBeNull();
  expect(getVideoRecordingCountdownSessionId()).toBeNull();
  expect(hasActiveVideoRecordingTab()).toBe(true);
  expect(isVideoRecordingPreparationInProgress()).toBe(false);
  expect(isVideoRecordingStopInProgress()).toBe(false);
});
