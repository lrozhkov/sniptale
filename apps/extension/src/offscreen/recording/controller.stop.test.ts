import { beforeEach, expect, it, vi } from 'vitest';

const { cleanupResourcesMock, loggerDebugMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  cleanupResourcesMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

vi.mock('./start/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./start/index')>();
  return {
    ...actual,
    cleanupResources: cleanupResourcesMock,
  };
});

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../platform/runtime-messaging/index')>();
  return {
    ...actual,
    sendRuntimeMessage: sendRuntimeMessageMock,
  };
});

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sniptale/platform/observability/logger')>();
  return {
    ...actual,
    createLogger: () => ({ debug: loggerDebugMock }),
  };
});

import { stopRecording } from './controller';
import { recordingContext } from './context';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

beforeEach(() => {
  vi.clearAllMocks();
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  recordingContext.resetRecordingSession();
  recordingContext.mediaRecorder = null;
});

it('publishes stopped with the session id when cleanup clears an inactive recorder session', async () => {
  recordingContext.beginRecordingSession('recording-race');
  cleanupResourcesMock.mockImplementationOnce(() => {
    recordingContext.resetRecordingSession();
  });

  await expect(stopRecording()).resolves.toBeUndefined();

  expect(cleanupResourcesMock).toHaveBeenCalledOnce();
  expect(loggerDebugMock).toHaveBeenCalledWith('Stop requested without an active recording');
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_RECORDING_STOPPED,
    recordingId: 'recording-race',
  });
});
