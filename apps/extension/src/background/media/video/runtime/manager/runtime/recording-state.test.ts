import { beforeEach, expect, it, vi } from 'vitest';

const { stopDiagnosticsMock } = vi.hoisted(() => ({
  stopDiagnosticsMock: vi.fn(),
}));

vi.mock('../../../../../diagnostics/public/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../diagnostics/public/session')>()),
  stopDiagnostics: stopDiagnosticsMock,
}));

import {
  finalizeRecordingDiagnostics,
  getCurrentRecordingId,
  getRecordingTabId,
  isRecording,
  resetRecordingId,
  resetRecordingTabId,
} from './recording-state';
import { videoManagerSession } from '../../../manager/session';
import { resetVideoRecordingRuntimeState } from '../../session-state';

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, {
    chrome: {
      action: {
        setBadgeBackgroundColor: vi.fn(),
        setBadgeText: vi.fn(),
        setTitle: vi.fn(),
      },
      runtime: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    },
  });

  resetVideoRecordingRuntimeState();
  videoManagerSession.recordingTabId = null;
  videoManagerSession.currentRecordingId = null;
});

it('reads and resets recording identifiers through the session facade', () => {
  videoManagerSession.recordingTabId = 7;
  videoManagerSession.currentRecordingId = 'recording-1';

  expect(getRecordingTabId()).toBe(7);
  expect(isRecording()).toBe(true);
  expect(getCurrentRecordingId()).toBe('recording-1');

  resetRecordingTabId();
  resetRecordingId();

  expect(getRecordingTabId()).toBeNull();
  expect(isRecording()).toBe(false);
  expect(getCurrentRecordingId()).toBeNull();
});

it('finalizes diagnostics for the active recording id and clears it afterwards', async () => {
  videoManagerSession.currentRecordingId = 'recording-1';

  await finalizeRecordingDiagnostics();

  expect(stopDiagnosticsMock).toHaveBeenCalledWith('recording-1');
  expect(videoManagerSession.currentRecordingId).toBeNull();
});

it('keeps the active recording id when finalizing a different recording id', async () => {
  videoManagerSession.currentRecordingId = 'recording-1';

  await finalizeRecordingDiagnostics('recording-2');

  expect(stopDiagnosticsMock).toHaveBeenCalledWith('recording-2');
  expect(videoManagerSession.currentRecordingId).toBe('recording-1');
});

it('swallows diagnostics finalization failures and clears the active recording id', async () => {
  videoManagerSession.currentRecordingId = 'recording-1';
  stopDiagnosticsMock.mockRejectedValue(new Error('diagnostics failed'));

  await expect(finalizeRecordingDiagnostics()).resolves.toBeUndefined();

  expect(videoManagerSession.currentRecordingId).toBeNull();
});

it('does nothing when no recording id is available to finalize', async () => {
  await expect(finalizeRecordingDiagnostics()).resolves.toBeUndefined();

  expect(stopDiagnosticsMock).not.toHaveBeenCalled();
});
