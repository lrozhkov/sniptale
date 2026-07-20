import { beforeEach, expect, it, vi } from 'vitest';

const { createCaptureJobMock, loggerWarnMock, transitionCaptureJobMock } = vi.hoisted(() => ({
  createCaptureJobMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  transitionCaptureJobMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}));

vi.mock('./state-machine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state-machine')>()),
  createCaptureJob: createCaptureJobMock,
  transitionCaptureJob: transitionCaptureJobMock,
}));

import { createRenderedCaptureJob } from './rendered-job';

beforeEach(() => {
  vi.clearAllMocks();
  createCaptureJobMock.mockResolvedValue({ jobId: 'capture-job-rendered' });
  transitionCaptureJobMock.mockResolvedValue(undefined);
});

it('creates a rendered capture job ready for download binding', async () => {
  await expect(createRenderedCaptureJob(42)).resolves.toBe('capture-job-rendered');

  expect(createCaptureJobMock).toHaveBeenCalledWith(42);
  expect(transitionCaptureJobMock).toHaveBeenNthCalledWith(1, 'capture-job-rendered', 'capturing');
  expect(transitionCaptureJobMock).toHaveBeenNthCalledWith(2, 'capture-job-rendered', 'rendering');
});

it('marks rendered capture job preparation failures with a fallback error', async () => {
  transitionCaptureJobMock.mockRejectedValueOnce('transition failed').mockResolvedValueOnce({});

  await expect(createRenderedCaptureJob(42)).rejects.toBe('transition failed');

  expect(transitionCaptureJobMock).toHaveBeenLastCalledWith('capture-job-rendered', 'failed', {
    error: 'Capture job preparation failed',
  });
  expect(loggerWarnMock).not.toHaveBeenCalled();
});

it('keeps rendered capture job preparation error messages', async () => {
  transitionCaptureJobMock
    .mockRejectedValueOnce(new Error('render transition failed'))
    .mockResolvedValueOnce({});

  await expect(createRenderedCaptureJob(42)).rejects.toThrow('render transition failed');

  expect(transitionCaptureJobMock).toHaveBeenLastCalledWith('capture-job-rendered', 'failed', {
    error: 'render transition failed',
  });
});
