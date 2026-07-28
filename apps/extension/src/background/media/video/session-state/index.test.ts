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

it('reads the recording session through the folder facade', () => {
  expect(getVideoRecordingTabId()).toBe(11);
  expect(getVideoRecordingId()).toBe('recording-1');
  expect(getVideoRecordingCaptureMode()).toBeNull();
  expect(getVideoRecordingCountdownSessionId()).toBeNull();
  expect(hasActiveVideoRecordingTab()).toBe(true);
  expect(isVideoRecordingPreparationInProgress()).toBe(false);
  expect(isVideoRecordingStopInProgress()).toBe(false);
});

it('transitions preparation and stop state through the folder facade', () => {
  beginVideoRecordingPreparation(CaptureMode.TAB, DEFAULT_VIDEO_SETTINGS, 'wide');

  expect(videoManagerSession.isStarting).toBe(true);
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

  resetVideoRecordingStartSession();
  setVideoRecordingCountdownSessionId('countdown-1');
  setVideoRecordingId('recording-2');
  setVideoRecordingTabId(22);
  markVideoRecordingPreparationSettled();

  const context = beginVideoRecordingStop();
  expect(context).toEqual({
    tabId: 22,
    mode: null,
    shouldResetImmediately: false,
  });

  finishVideoRecordingStop();
  expect(videoManagerSession.isStopping).toBe(false);
});

it('writes a null viewport preset when preparation starts without an explicit preset', () => {
  beginVideoRecordingPreparation(CaptureMode.TAB, DEFAULT_VIDEO_SETTINGS, null);

  expect(setVideoRecordingRuntimeState).toHaveBeenCalledWith({
    status: VideoRecordingStatus.PREPARING,
    duration: 0,
    countdownEndsAt: null,
    captureMode: CaptureMode.TAB,
    captureSource: null,
    cropRegion: null,
    viewportPresetId: null,
    liveMedia: expect.any(Object),
    error: null,
  });
});
