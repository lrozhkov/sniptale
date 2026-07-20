import { beforeEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const { loggerDebugMock, loggerWarnMock, sendRuntimeMessageMock } = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
}));

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
  triggerMultiSourceDownload,
} from './messages';

beforeEach(() => {
  vi.clearAllMocks();
  sendRuntimeMessageMock.mockResolvedValue(undefined);
});

it('sends multi-source lifecycle, save, and download runtime messages', async () => {
  notifyMultiSourceStarted('rec-base', { frameRate: 30, height: 720, width: 1280 });
  await notifyMultiSourceSaved({ projectId: 'project-1', recordingId: 'rec-1' });
  await notifyMultiSourceSaved({ projectId: null, recordingId: 'rec-base' });
  await triggerMultiSourceDownload('rec-1', 'window-1.webm');
  await notifyMultiSourceStopped('rec-base');

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'OFFSCREEN_RECORDING_STARTED',
    recordingId: 'rec-base',
    webcamSettings: { frameRate: 30, height: 720, width: 1280 },
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.VIDEO_SAVED_TO_IDB,
    projectId: 'project-1',
    recordingId: 'rec-1',
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.VIDEO_SAVED_TO_IDB,
    recordingId: 'rec-base',
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.DOWNLOAD_RECORDING,
    recordingId: 'rec-1',
    filename: 'window-1.webm',
  });
  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: 'OFFSCREEN_RECORDING_STOPPED',
    recordingId: 'rec-base',
  });
});

it('logs lifecycle and download notification failures without throwing', async () => {
  sendRuntimeMessageMock.mockRejectedValue(new Error('runtime closed'));

  notifyMultiSourceStarted('rec-base', null);
  await notifyMultiSourceSaved({ projectId: null, recordingId: 'rec-base' });
  await triggerMultiSourceDownload('rec-1', 'window-1.webm');
  await notifyMultiSourceStopped('rec-base');

  expect(loggerDebugMock).toHaveBeenCalled();
  expect(loggerWarnMock).toHaveBeenCalled();
});
