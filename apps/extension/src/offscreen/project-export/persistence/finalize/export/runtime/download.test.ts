import { afterEach, expect, it, vi } from 'vitest';

import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { downloadExportRecording } from './download';

const { createLoggerMock, sendRuntimeMessageBestEffortMock } = vi.hoisted(() => ({
  createLoggerMock: vi.fn(() => ({ debug: vi.fn() })),
  sendRuntimeMessageBestEffortMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: createLoggerMock,
}));

vi.mock('../../../../../runtime-messaging/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../runtime-messaging/best-effort')>()),
  sendRuntimeMessageBestEffort: sendRuntimeMessageBestEffortMock,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

it('skips the download request when download-after-export is disabled', () => {
  downloadExportRecording('recording-1', 'export.mp4', false);

  expect(sendRuntimeMessageBestEffortMock).not.toHaveBeenCalled();
});

it('requests a download when download-after-export is enabled', () => {
  downloadExportRecording('recording-1', 'export.mp4', true);

  expect(sendRuntimeMessageBestEffortMock).toHaveBeenCalledWith({
    logger: expect.any(Object),
    logMessage: 'Failed to trigger recording download after project export',
    payload: {
      type: VideoMessageType.DOWNLOAD_RECORDING,
      recordingId: 'recording-1',
      filename: 'export.mp4',
    },
  });
});
