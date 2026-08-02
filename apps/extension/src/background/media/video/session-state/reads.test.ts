import { beforeEach, expect, it } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { videoManagerSession } from '../manager/session';
import {
  getVideoRecordingCaptureMode,
  getVideoRecordingCountdownSessionId,
  getVideoRecordingId,
  getVideoRecordingTabId,
  hasActiveVideoRecordingSession,
  hasActiveVideoRecordingTab,
  isCurrentVideoRecordingId,
  isVideoRecordingPreparationInProgress,
  isVideoRecordingStopInProgress,
} from './reads';

beforeEach(() => {
  videoManagerSession.recordingTabId = 42;
  videoManagerSession.currentRecordingId = 'recording-42';
  videoManagerSession.isStarting = true;
  videoManagerSession.isStopping = false;
  videoManagerSession.currentCaptureMode = CaptureMode.TAB;
  videoManagerSession.currentCountdownSessionId = 'countdown-42';
});

it('reads recording session fields through the read facade', () => {
  expect(getVideoRecordingTabId()).toBe(42);
  expect(getVideoRecordingId()).toBe('recording-42');
  expect(getVideoRecordingCaptureMode()).toBe(CaptureMode.TAB);
  expect(getVideoRecordingCountdownSessionId()).toBe('countdown-42');
  expect(isVideoRecordingPreparationInProgress()).toBe(true);
  expect(isVideoRecordingStopInProgress()).toBe(false);
  expect(hasActiveVideoRecordingTab()).toBe(true);
});

it('matches only the exact non-null current recording identity', () => {
  expect(isCurrentVideoRecordingId('recording-42')).toBe(true);
  expect(isCurrentVideoRecordingId('recording-other')).toBe(false);
  expect(isCurrentVideoRecordingId(null)).toBe(false);
  expect(isCurrentVideoRecordingId(undefined)).toBe(false);
});

it('distinguishes capture-only and inactive recording sessions', () => {
  videoManagerSession.recordingTabId = null;
  videoManagerSession.currentRecordingId = null;

  expect(hasActiveVideoRecordingTab()).toBe(false);
  expect(hasActiveVideoRecordingSession()).toBe(true);

  videoManagerSession.currentCaptureMode = null;

  expect(hasActiveVideoRecordingSession()).toBe(false);
});
