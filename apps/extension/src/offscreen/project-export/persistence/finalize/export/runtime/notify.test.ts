import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VideoExportFormat } from '../../../../../../features/video/project/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { notifyProjectExportCompleted } from './notify';

const { createLoggerMock, markTerminalMock, sendRuntimeMessageBestEffortMock } = vi.hoisted(() => ({
  createLoggerMock: vi.fn(() => ({ debug: vi.fn() })),
  markTerminalMock: vi.fn(),
  sendRuntimeMessageBestEffortMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: createLoggerMock,
}));

vi.mock('../../../../../runtime-messaging/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../runtime-messaging/best-effort')>()),
  sendRuntimeMessageBestEffort: sendRuntimeMessageBestEffortMock,
}));

vi.mock('../../../../../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../../composition/persistence/export-ledger')
  >()),
  markProjectExportJobTerminal: markTerminalMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('notifies completion with the export context and message payload', async () => {
  markTerminalMock.mockResolvedValue({ status: 'completed' });

  await expect(
    notifyProjectExportCompleted({
      exportId: 'export-1',
      filename: 'export.mp4',
      format: VideoExportFormat.MP4,
      jobId: 'job-1',
      projectId: 'project-1',
      recordingId: 'recording-1',
    })
  ).resolves.toBe(true);

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

it('does not emit completed notification when completion terminal resolves as cancelled', async () => {
  markTerminalMock.mockResolvedValue({ status: 'cancelled' });

  await expect(
    notifyProjectExportCompleted({
      exportId: 'export-1',
      filename: 'export.mp4',
      format: VideoExportFormat.MP4,
      jobId: 'job-1',
      projectId: 'project-1',
      recordingId: 'recording-1',
    })
  ).resolves.toBe(false);

  expect(sendRuntimeMessageBestEffortMock).not.toHaveBeenCalled();
});

it('keeps accepted completion terminal when cancellation trips after terminal write starts', async () => {
  const abortController = new AbortController();
  markTerminalMock.mockImplementation(async () => {
    abortController.abort();
    return { status: 'completed' };
  });

  await expect(
    notifyProjectExportCompleted(
      {
        exportId: 'export-1',
        filename: 'export.mp4',
        format: VideoExportFormat.MP4,
        jobId: 'job-1',
        projectId: 'project-1',
        recordingId: 'recording-1',
      },
      { signal: abortController.signal }
    )
  ).resolves.toBe(true);

  expect(sendRuntimeMessageBestEffortMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: expect.objectContaining({
        jobId: 'job-1',
        type: VideoMessageType.PROJECT_EXPORT_COMPLETED,
      }),
    })
  );
});
