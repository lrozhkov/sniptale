import { beforeEach, expect, it } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { videoManagerSession } from '../manager/session';
import { beginVideoRecordingStop, finishVideoRecordingStop } from './stop';

beforeEach(() => {
  videoManagerSession.recordingTabId = 23;
  videoManagerSession.currentCaptureMode = CaptureMode.VIEWPORT_EMULATION;
  videoManagerSession.currentCountdownSessionId = null;
  videoManagerSession.isStarting = false;
  videoManagerSession.isStopping = false;
  videoManagerSession.viewportNavigationEpoch = 2;
  videoManagerSession.viewportNavigationPending = true;
  videoManagerSession.openEditorAfterRecording = true;
  videoManagerSession.controlledCursorCaptureEnabled = true;
  videoManagerSession.controlledCursorAutoPaused = true;
  videoManagerSession.controlledCursorNavigationEpoch = 3;
  videoManagerSession.controlledCursorNavigationPending = true;
  videoManagerSession.controlledCursorOffsetSeconds = 8;
  videoManagerSession.controlledCursorTelemetry = {
    actionEvents: [],
    cursorTrack: null,
    signals: [],
    viewport: null,
  };
});

it('preserves tab and mode until deferred stop cleanup when no immediate reset is needed', () => {
  expect(beginVideoRecordingStop()).toEqual({
    mode: CaptureMode.VIEWPORT_EMULATION,
    shouldResetImmediately: false,
    tabId: 23,
  });
  expect(videoManagerSession.recordingTabId).toBe(23);
  expect(videoManagerSession.currentCaptureMode).toBe(CaptureMode.VIEWPORT_EMULATION);
  expect(videoManagerSession.viewportNavigationPending).toBe(false);
});

it('resets active session fields immediately when start/countdown teardown is still in flight', () => {
  videoManagerSession.isStarting = true;
  videoManagerSession.currentCountdownSessionId = 'countdown-7';

  expect(beginVideoRecordingStop()).toEqual({
    mode: CaptureMode.VIEWPORT_EMULATION,
    shouldResetImmediately: true,
    tabId: 23,
  });
  expect(videoManagerSession.recordingTabId).toBeNull();
  expect(videoManagerSession.currentCaptureMode).toBeNull();

  finishVideoRecordingStop();
  expect(videoManagerSession.isStopping).toBe(false);
  expect(videoManagerSession.openEditorAfterRecording).toBe(false);
  expect(videoManagerSession.controlledCursorCaptureEnabled).toBe(false);
  expect(videoManagerSession.controlledCursorAutoPaused).toBe(false);
  expect(videoManagerSession.controlledCursorNavigationEpoch).toBe(3);
  expect(videoManagerSession.controlledCursorNavigationPending).toBe(false);
  expect(videoManagerSession.controlledCursorOffsetSeconds).toBe(0);
  expect(videoManagerSession.controlledCursorTelemetry).toBeNull();
});
