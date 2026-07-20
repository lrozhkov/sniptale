import { beforeEach, expect, it, vi } from 'vitest';

import { requestSidecarDownload } from './request';

const { createLoggerMock, sendRuntimeMessageBestEffortMock } = vi.hoisted(() => ({
  createLoggerMock: vi.fn(() => ({ debug: vi.fn() })),
  sendRuntimeMessageBestEffortMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  Logger: undefined,
  createLogger: createLoggerMock,
  isTraceEnabled: vi.fn(() => false),
}));

vi.mock('../../../../../../runtime-messaging/best-effort', () => ({
  logOffscreenDebugError: vi.fn(),
  sendRuntimeMessageBestEffort: sendRuntimeMessageBestEffortMock,
  stringifyOffscreenError: vi.fn((error: unknown) => String(error)),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

it('requests the subtitle sidecar download through the runtime bridge', () => {
  requestSidecarDownload({
    content: 'WEBVTT',
    filename: 'export.vtt',
    mimeType: 'text/vtt',
  });

  expect(sendRuntimeMessageBestEffortMock).toHaveBeenCalledWith({
    logger: expect.any(Object),
    logMessage: 'Failed to trigger subtitle sidecar download after project export',
    payload: {
      type: 'DOWNLOAD_RECORDING_SIDECAR',
      content: 'WEBVTT',
      filename: 'export.vtt',
      mimeType: 'text/vtt',
    },
  });
});
