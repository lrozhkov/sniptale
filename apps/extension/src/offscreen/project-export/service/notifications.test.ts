import { beforeEach, expect, it, vi } from 'vitest';

const { loggerErrorMock, markTerminalMock, sendRuntimeMessageBestEffortMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  markTerminalMock: vi.fn(),
  sendRuntimeMessageBestEffortMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('../../runtime-messaging/best-effort', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime-messaging/best-effort')>()),
  sendRuntimeMessageBestEffort: sendRuntimeMessageBestEffortMock,
}));

vi.mock('../../../composition/persistence/export-ledger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/export-ledger')>()),
  markProjectExportJobTerminal: markTerminalMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  markTerminalMock.mockResolvedValue(null);
});

it('marks cancellation terminal before emitting the runtime cancellation message', async () => {
  const { sendProjectExportCancelled } = await import('./notifications');

  await sendProjectExportCancelled('job-1');

  expect(markTerminalMock).toHaveBeenCalledWith('job-1', 'cancelled');
  expect(sendRuntimeMessageBestEffortMock).toHaveBeenCalledWith({
    context: { jobId: 'job-1' },
    logger: expect.any(Object),
    logMessage: 'Failed to notify runtime about cancelled project export',
    payload: {
      type: 'PROJECT_EXPORT_CANCELLED',
      jobId: 'job-1',
    },
  });
});

it('marks failures terminal and normalizes non-error values for the runtime message', async () => {
  const { sendProjectExportFailed } = await import('./notifications');

  await sendProjectExportFailed('job-2', 'transport failed');

  expect(markTerminalMock).toHaveBeenCalledWith('job-2', 'failed', 'transport failed');
  expect(loggerErrorMock).toHaveBeenCalledWith('Failed', 'transport failed');
  expect(sendRuntimeMessageBestEffortMock).toHaveBeenCalledWith({
    context: { jobId: 'job-2' },
    logger: expect.any(Object),
    logMessage: 'Failed to notify runtime about failed project export',
    payload: {
      type: 'PROJECT_EXPORT_FAILED',
      jobId: 'job-2',
      error: 'transport failed',
    },
  });
});

it('still emits cancellation lifecycle when terminal storage update fails', async () => {
  const { sendProjectExportCancelled } = await import('./notifications');
  markTerminalMock.mockRejectedValueOnce(new Error('storage unavailable'));

  await sendProjectExportCancelled('job-3');

  expect(loggerErrorMock).toHaveBeenCalledWith(
    'Failed to mark project export terminal',
    expect.any(Error)
  );
  expect(sendRuntimeMessageBestEffortMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: {
        type: 'PROJECT_EXPORT_CANCELLED',
        jobId: 'job-3',
      },
    })
  );
});

it('still emits failure lifecycle when terminal storage update fails', async () => {
  const { sendProjectExportFailed } = await import('./notifications');
  markTerminalMock.mockRejectedValueOnce(new Error('storage unavailable'));

  await sendProjectExportFailed('job-4', new Error('render failed'));

  expect(loggerErrorMock).toHaveBeenCalledWith('Failed', expect.any(Error));
  expect(loggerErrorMock).toHaveBeenCalledWith(
    'Failed to mark project export terminal',
    expect.any(Error)
  );
  expect(sendRuntimeMessageBestEffortMock).toHaveBeenCalledWith(
    expect.objectContaining({
      payload: {
        type: 'PROJECT_EXPORT_FAILED',
        jobId: 'job-4',
        error: 'render failed',
      },
    })
  );
});
