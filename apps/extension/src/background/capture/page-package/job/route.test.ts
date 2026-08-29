import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const mocks = vi.hoisted(() => ({
  ack: vi.fn(),
  cancel: vi.fn(),
  getStatus: vi.fn(),
  start: vi.fn(),
}));

vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index')>()),
  acknowledgePagePackageJobStatus: mocks.ack,
  cancelPagePackageJob: mocks.cancel,
  getPagePackageJobStatus: mocks.getStatus,
  startPagePackageJobFromSources: mocks.start,
}));

import { routePagePackageJobMessage } from './route';

const contentPort = {
  cancelPagePackage: vi.fn(),
  requestPagePackage: vi.fn(),
};

const options = {
  includeBasicLogs: false,
  includeCssDiagnostics: false,
  includeFiles: true,
  includeFullPageScreenshot: false,
  includeImages: true,
  includeJson: true,
  includeMarkdown: true,
  includePageDiagnostics: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ack.mockResolvedValue(null);
  mocks.cancel.mockResolvedValue({ phase: 'cancelling' });
  mocks.getStatus.mockResolvedValue(null);
  mocks.start.mockResolvedValue({ phase: 'running' });
});

it('routes start, status, cancellation, and acknowledgement through the job owner', async () => {
  const sendResponse = vi.fn();
  expect(
    routePagePackageJobMessage(
      {
        includeWebCopy: false,
        intent: 'export',
        jobId: 'job-1',
        options,
        captureTiming: { loadTimeoutMs: 30_000, settleDelayMs: 2_000 },
        sources: [{ kind: 'tab', tabId: 7, title: 'Page' }],
        type: MessageType.START_PAGE_PACKAGE_JOB,
        warnings: [],
      },
      sendResponse,
      contentPort
    )
  ).toBe(true);
  await vi.waitFor(() => expect(mocks.start).toHaveBeenCalled());

  routePagePackageJobMessage(
    { jobId: 'job-1', type: MessageType.GET_PAGE_PACKAGE_JOB_STATUS },
    sendResponse,
    contentPort
  );
  routePagePackageJobMessage(
    { jobId: 'job-1', type: MessageType.CANCEL_PAGE_PACKAGE_JOB },
    sendResponse,
    contentPort
  );
  routePagePackageJobMessage(
    { jobId: 'job-1', type: MessageType.ACK_PAGE_PACKAGE_JOB_STATUS },
    sendResponse,
    contentPort
  );
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(4));

  expect(mocks.getStatus).toHaveBeenCalledWith('job-1');
  expect(mocks.cancel).toHaveBeenCalledWith('job-1');
  expect(mocks.ack).toHaveBeenCalledWith('job-1');
});

it('rejects unrelated messages and surfaces owner failures', async () => {
  const sendResponse = vi.fn();
  expect(routePagePackageJobMessage(null, sendResponse, contentPort)).toBe(false);
  expect(routePagePackageJobMessage({ type: 'UNKNOWN' }, sendResponse, contentPort)).toBe(false);

  mocks.cancel.mockRejectedValueOnce(new Error('cancel failed'));
  expect(
    routePagePackageJobMessage(
      { jobId: 'job-1', type: MessageType.CANCEL_PAGE_PACKAGE_JOB },
      sendResponse,
      contentPort
    )
  ).toBe(true);
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({ error: 'cancel failed', success: false })
  );
});
