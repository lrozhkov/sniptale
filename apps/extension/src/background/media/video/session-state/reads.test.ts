import { beforeEach, expect, it } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { videoManagerSession } from '../manager/session';
import {
  getVideoRecordingCaptureMode,
  getVideoRecordingCountdownSessionId,
  getVideoRecordingId,
  getVideoRecordingTabId,
  getViewportNavigationEpoch,
  hasActiveVideoRecordingTab,
  isVideoRecordingPreparationInProgress,
  isVideoRecordingStopInProgress,
  isViewportNavigationPending,
  shouldOpenVideoEditorAfterRecording,
} from './reads';

beforeEach(() => {
  videoManagerSession.recordingTabId = 42;
  videoManagerSession.currentRecordingId = 'recording-42';
  videoManagerSession.openEditorAfterRecording = true;
  videoManagerSession.isStarting = true;
  videoManagerSession.isStopping = false;
  videoManagerSession.currentCaptureMode = CaptureMode.TAB;
  videoManagerSession.currentCountdownSessionId = 'countdown-42';
  videoManagerSession.viewportNavigationEpoch = 8;
  videoManagerSession.viewportNavigationPending = true;
});

it('reads recording session fields through the read facade', () => {
  expect(getVideoRecordingTabId()).toBe(42);
  expect(getVideoRecordingId()).toBe('recording-42');
  expect(shouldOpenVideoEditorAfterRecording()).toBe(true);
  expect(getVideoRecordingCaptureMode()).toBe(CaptureMode.TAB);
  expect(getVideoRecordingCountdownSessionId()).toBe('countdown-42');
  expect(getViewportNavigationEpoch()).toBe(8);
  expect(isViewportNavigationPending()).toBe(true);
  expect(isVideoRecordingPreparationInProgress()).toBe(true);
  expect(isVideoRecordingStopInProgress()).toBe(false);
  expect(hasActiveVideoRecordingTab()).toBe(true);
});
