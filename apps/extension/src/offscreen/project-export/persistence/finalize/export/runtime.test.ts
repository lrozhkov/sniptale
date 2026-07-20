import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoExportFormat } from '../../../../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { downloadExportRecording, notifyProjectExportCompleted } from './runtime/index';

const { createLoggerMock, markTerminalMock, sendRuntimeMessageBestEffortMock } = vi.hoisted(() => ({
  createLoggerMock: vi.fn(() => ({ debug: vi.fn() })),
  markTerminalMock: vi.fn(),
  sendRuntimeMessageBestEffortMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: createLoggerMock,
}));

vi.mock('../../../../runtime-messaging/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../runtime-messaging/best-effort')>()),
  sendRuntimeMessageBestEffort: sendRuntimeMessageBestEffortMock,
}));

vi.mock('../../../../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/export-ledger')
  >()),
  markProjectExportJobTerminal: markTerminalMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  markTerminalMock.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
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

it('notifies completion with the export context and message payload', async () => {
  markTerminalMock.mockResolvedValue({ status: 'completed' });

  await notifyProjectExportCompleted({
    exportId: 'export-1',
    filename: 'export.mp4',
    format: VideoExportFormat.MP4,
    jobId: 'job-1',
    projectId: 'project-1',
    recordingId: 'recording-1',
  });

  expect(sendRuntimeMessageBestEffortMock).toHaveBeenCalledWith({
    context: {
      exportId: 'export-1',
      jobId: 'job-1',
      projectId: 'project-1',
      recordingId: 'recording-1',
    },
    logger: expect.any(Object),
    logMessage: 'Failed to notify runtime about completed project export',
    payload: {
      type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
      jobId: 'job-1',
      projectId: 'project-1',
      recordingId: 'recording-1',
      exportId: 'export-1',
      filename: 'export.mp4',
      format: VideoExportFormat.MP4,
    },
  });
  expect(markTerminalMock).toHaveBeenCalledWith('job-1', 'completed');
});
