import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const { loggerDebugMock, loggerWarnMock, outboxState, sendRuntimeMessageMock } = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  outboxState: { result: null as unknown },
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/recordings/completion-outbox',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/recordings/completion-outbox')
    >()),
    readVideoRecordingCompletionOutbox: vi.fn(async () => outboxState.result),
    removeVideoRecordingCompletionOutbox: vi.fn().mockResolvedValue(true),
  })
);

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({ debug: loggerDebugMock, warn: loggerWarnMock }),
}));

vi.mock('../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

import {
  notifyMultiSourceSaved,
  notifyMultiSourceStarted,
  notifyMultiSourceStopped,
} from './messages';
import { discardPendingPostRecordResult } from '../post-record-publication';

beforeEach(() => {
  vi.clearAllMocks();
  outboxState.result = {
    primaryRecordingId: 'rec-base-window-1',
    projectId: 'project-1',
    recordingId: 'rec-base',
  };
  sendRuntimeMessageMock.mockResolvedValue({ success: true, result: 'accepted' });
});

afterEach(() => {
  discardPendingPostRecordResult('rec-base');
});

it('sends multi-source lifecycle and grouped save runtime messages', async () => {
  notifyMultiSourceStarted('rec-base', { frameRate: 30, height: 720, width: 1280 });
  await notifyMultiSourceSaved({
    primaryRecordingId: 'rec-base-window-1',
    projectId: 'project-1',
    recordingId: 'rec-base',
  });
  await notifyMultiSourceStopped('rec-base');

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'OFFSCREEN_RECORDING_STARTED',
    recordingId: 'rec-base',
    webcamSettings: { frameRate: 30, height: 720, width: 1280 },
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.VIDEO_SAVED_TO_IDB,
    primaryRecordingId: 'rec-base-window-1',
    projectId: 'project-1',
    recordingId: 'rec-base',
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'OFFSCREEN_RECORDING_STOPPED',
    recordingId: 'rec-base',
  });
});

it('keeps non-terminal lifecycle notification failures low-noise', async () => {
  sendRuntimeMessageMock.mockRejectedValue(new Error('runtime closed'));

  notifyMultiSourceStarted('rec-base', null);
  await notifyMultiSourceStopped('rec-base');

  expect(loggerDebugMock).toHaveBeenCalled();
  expect(loggerWarnMock).not.toHaveBeenCalled();
});

it('requires positive persistence acknowledgement for the saved result', async () => {
  outboxState.result = {
    primaryRecordingId: 'rec-base-window-1',
    projectId: null,
    recordingId: 'rec-base',
  };
  sendRuntimeMessageMock.mockResolvedValueOnce({ success: false, error: 'storage failed' });

  await expect(
    notifyMultiSourceSaved({
      primaryRecordingId: 'rec-base-window-1',
      projectId: null,
      recordingId: 'rec-base',
    })
  ).rejects.toThrow('storage failed');

  sendRuntimeMessageMock.mockRejectedValueOnce(new Error('runtime closed'));
  await expect(
    notifyMultiSourceSaved({
      primaryRecordingId: 'rec-base-window-1',
      projectId: null,
      recordingId: 'rec-base',
    })
  ).rejects.toThrow('runtime closed');
});
