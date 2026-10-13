import { beforeEach, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { installBackgroundRuntimeMessagingMock } from '../../../../../routing-contracts/runtime-messaging/mock';

const { sendTabMessageMock } = vi.hoisted(() => ({
  sendTabMessageMock: vi.fn(),
}));

vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  sendTabMessage: sendTabMessageMock,
}));

import {
  disableControlledCursorCapture,
  enableControlledCursorCapture,
  syncControlledCursorCapture,
} from './messages';

beforeEach(() => {
  vi.clearAllMocks();
  sendTabMessageMock.mockResolvedValue({ success: true });
  installBackgroundRuntimeMessagingMock({ sendTabMessage: sendTabMessageMock });
});

it('sends dedicated controlled cursor bootstrap messages to the recording tab', async () => {
  await enableControlledCursorCapture(7, 'recording-1', 3.5);

  expect(sendTabMessageMock).toHaveBeenCalledWith(7, {
    type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
    recordingId: 'recording-1',
    offsetSeconds: 3.5,
  });
});

it('returns telemetry snapshots from the disable path and syncs pause and resume commands', async () => {
  sendTabMessageMock
    .mockResolvedValueOnce({
      success: true,
      telemetry: { actionEvents: [], cursorTrack: null, viewport: null },
    })
    .mockResolvedValueOnce({ success: true })
    .mockResolvedValueOnce({ success: true });

  await expect(disableControlledCursorCapture(7)).resolves.toEqual({
    actionEvents: [],
    cursorTrack: null,
    viewport: null,
  });
  await syncControlledCursorCapture(7, 'pause');
  await syncControlledCursorCapture(7, 'resume');

  expect(sendTabMessageMock).toHaveBeenNthCalledWith(2, 7, {
    type: VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE,
  });
  expect(sendTabMessageMock).toHaveBeenNthCalledWith(3, 7, {
    type: VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE,
  });
});
it('transmits explicit unavailable and correlated source clocks without creating an offset guess', async () => {
  const frameClock = {
    recordingId: 'recording-1',
    streamInstanceId: 'native',
    generation: 2,
    revision: 3,
    phase: 'active' as const,
    captureEpochMs: 1000,
    mediaTimeSeconds: 4,
  };
  await enableControlledCursorCapture(7, 'recording-1', 0, null);
  expect(sendTabMessageMock).toHaveBeenLastCalledWith(7, {
    type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
    recordingId: 'recording-1',
    frameClock: null,
  });
  await syncControlledCursorCapture(7, 'resume', frameClock);
  expect(sendTabMessageMock).toHaveBeenLastCalledWith(7, {
    type: VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE,
    frameClock,
  });
  await enableControlledCursorCapture(7, 'recording-1', 0, frameClock);
  expect(sendTabMessageMock).toHaveBeenLastCalledWith(7, {
    type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
    recordingId: 'recording-1',
    frameClock,
  });
  await expect(disableControlledCursorCapture(7)).resolves.toBeNull();
});
