import { beforeEach, expect, it, vi } from 'vitest';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

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
  freezeViewportNavigation,
  clearViewportNavigationPending,
  getVideoRecordingCaptureMode,
  getVideoRecordingCountdownSessionId,
  getVideoRecordingId,
  getVideoRecordingTabId,
  getViewportNavigationEpoch,
  hasActiveVideoRecordingTab,
  isVideoRecordingPreparationInProgress,
  isVideoRecordingStopInProgress,
  isViewportNavigationPending,
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
  videoManagerSession.viewportNavigationEpoch = 4;
  videoManagerSession.viewportNavigationPending = true;
}

beforeEach(resetSession);

it('enters PREPARING state and resets navigation bookkeeping for a new start', () => {
  const viewportPreset = {
    id: 'wide',
    label: 'Wide',
    width: 1920,
    height: 1080,
  };

  beginVideoRecordingPreparation(CaptureMode.VIEWPORT_EMULATION, viewportPreset);

  expect(videoManagerSession.isStarting).toBe(true);
  expect(videoManagerSession.currentCaptureMode).toBe(CaptureMode.VIEWPORT_EMULATION);
  expect(videoManagerSession.viewportNavigationEpoch).toBe(0);
  expect(videoManagerSession.viewportNavigationPending).toBe(false);
  expect(setVideoRecordingRuntimeState).toHaveBeenCalledWith({
    status: VideoRecordingStatus.PREPARING,
    duration: 0,
    countdownEndsAt: null,
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    captureSource: null,
    viewportPreset,
    liveMedia: null,
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
  expect(videoManagerSession.viewportNavigationEpoch).toBe(0);
  expect(videoManagerSession.viewportNavigationPending).toBe(false);
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

it('exposes session reads and viewport navigation transitions through dedicated helpers', () => {
  expect(getVideoRecordingTabId()).toBe(11);
  expect(getVideoRecordingId()).toBe('recording-1');
  expect(getVideoRecordingCaptureMode()).toBeNull();
  expect(getVideoRecordingCountdownSessionId()).toBeNull();
  expect(hasActiveVideoRecordingTab()).toBe(true);
  expect(isVideoRecordingPreparationInProgress()).toBe(false);
  expect(isVideoRecordingStopInProgress()).toBe(false);
  expect(isViewportNavigationPending()).toBe(true);
  expect(getViewportNavigationEpoch()).toBe(4);

  const navigationEpoch = freezeViewportNavigation();
  expect(navigationEpoch).toBe(5);
  expect(getViewportNavigationEpoch()).toBe(5);
  expect(isViewportNavigationPending()).toBe(true);

  clearViewportNavigationPending();
  expect(isViewportNavigationPending()).toBe(false);
});
