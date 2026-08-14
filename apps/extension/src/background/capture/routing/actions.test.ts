import { beforeEach, expect, it, vi } from 'vitest';

const { executeDownloadMock, createRenderedCaptureJobMock, transitionCaptureJobMock } = vi.hoisted(
  () => ({
    executeDownloadMock: vi.fn(),
    createRenderedCaptureJobMock: vi.fn(),
    transitionCaptureJobMock: vi.fn(),
  })
);

vi.mock('../download/download-router/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download/download-router/index')>()),
  executeDownload: executeDownloadMock,
}));

vi.mock('../jobs/rendered-job', () => ({
  createRenderedCaptureJob: createRenderedCaptureJobMock,
}));

vi.mock('../jobs/state-machine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../jobs/state-machine')>()),
  transitionCaptureJob: transitionCaptureJobMock,
}));

import { handleExecuteSave } from './actions.download';

beforeEach(() => {
  vi.clearAllMocks();
  executeDownloadMock.mockResolvedValue(undefined);
  createRenderedCaptureJobMock.mockResolvedValue('capture-job-route');
  transitionCaptureJobMock.mockResolvedValue(undefined);
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

it('executes save downloads', async () => {
  const sendResponse = vi.fn();

  expect(
    handleExecuteSave(
      {
        dataUrl: 'data:image/png;base64,1',
        filename: 'capture.png',
        actionType: 'download_default',
      },
      42,
      sendResponse
    )
  ).toBe(true);
  await flushPromises();

  expect(executeDownloadMock).toHaveBeenCalledWith(
    'data:image/png;base64,1',
    'capture.png',
    'download_default',
    undefined,
    'capture-job-route'
  );
});
