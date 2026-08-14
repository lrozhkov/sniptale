import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const mocks = vi.hoisted(() => ({
  cancel: vi.fn(),
  getStatus: vi.fn(),
  start: vi.fn(),
}));

vi.mock('./index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./index')>()),
  cancelPopupExportJob: mocks.cancel,
  getPopupExportJobStatus: mocks.getStatus,
  startPopupExportJob: mocks.start,
}));

import { routePopupExportJobMessage } from './route';

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
  mocks.cancel.mockResolvedValue({ phase: 'cancelling' });
  mocks.getStatus.mockResolvedValue(null);
  mocks.start.mockResolvedValue({ phase: 'running' });
});

it('routes start, status, and cancellation through the job owner', async () => {
  const sendResponse = vi.fn();
  expect(
    routePopupExportJobMessage(
      {
        jobId: 'job-1',
        options,
        orderedTabs: [{ tabId: 7, title: 'Page' }],
        type: MessageType.START_POPUP_EXPORT_JOB,
        warnings: [],
      },
      sendResponse
    )
  ).toBe(true);
  await vi.waitFor(() => expect(mocks.start).toHaveBeenCalled());

  routePopupExportJobMessage(
    { jobId: 'job-1', type: MessageType.GET_POPUP_EXPORT_JOB_STATUS },
    sendResponse
  );
  routePopupExportJobMessage(
    { jobId: 'job-1', type: MessageType.CANCEL_POPUP_EXPORT_JOB },
    sendResponse
  );
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(3));

  expect(mocks.getStatus).toHaveBeenCalledWith('job-1');
  expect(mocks.cancel).toHaveBeenCalledWith('job-1');
});

it('rejects unrelated messages and surfaces owner failures', async () => {
  const sendResponse = vi.fn();
  expect(routePopupExportJobMessage(null, sendResponse)).toBe(false);
  expect(routePopupExportJobMessage({ type: 'UNKNOWN' }, sendResponse)).toBe(false);

  mocks.cancel.mockRejectedValueOnce(new Error('cancel failed'));
  expect(
    routePopupExportJobMessage(
      { jobId: 'job-1', type: MessageType.CANCEL_POPUP_EXPORT_JOB },
      sendResponse
    )
  ).toBe(true);
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({ error: 'cancel failed', success: false })
  );
});
