import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  extendSession: vi.fn(),
  fetchAsset: vi.fn(),
  registerSession: vi.fn(),
  updateProgress: vi.fn(),
}));

vi.mock('../page-package/job/active-job', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../page-package/job/active-job')>()),
  updateActivePagePackageJobProducerProgress: mocks.updateProgress,
}));

vi.mock('./web-snapshot/fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./web-snapshot/fetch')>()),
  fetchWebSnapshotAssetsForSession: mocks.fetchAsset,
}));

vi.mock('./web-snapshot/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./web-snapshot/session')>()),
  extendWebSnapshotAssetSession: mocks.extendSession,
  registerWebSnapshotAssetSession: mocks.registerSession,
}));

import {
  handleFetchWebSnapshotAsset,
  handleRegisterWebSnapshotAssets,
  handleWebSnapshotSaveProgress,
} from './actions.web-snapshot';

beforeEach(() => {
  vi.clearAllMocks();
});

it('acknowledges progress only after the authoritative job status is updated', async () => {
  mocks.updateProgress.mockResolvedValue(undefined);
  const sendResponse = vi.fn();

  expect(
    handleWebSnapshotSaveProgress(
      { activeStepKey: 'files', current: 0, requestId: 'job-1', total: 1 },
      7,
      sendResponse
    )
  ).toBe(true);
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());

  expect(mocks.updateProgress).toHaveBeenCalledWith({
    activeStepKey: 'files',
    current: 0,
    requestId: 'job-1',
    tabId: 7,
    total: 1,
  });
  expect(sendResponse).toHaveBeenCalledWith();
});

it('returns the canonical route error when progress is not bound to the active job', async () => {
  mocks.updateProgress.mockRejectedValue(new Error('not bound'));
  const sendResponse = vi.fn();

  handleWebSnapshotSaveProgress(
    { activeStepKey: 'files', current: 0, requestId: 'job-2', total: 1 },
    7,
    sendResponse
  );
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());

  expect(sendResponse).toHaveBeenCalledWith({ error: 'not bound', success: false });
});

it('routes authorized asset fetch success and failure through the canonical response shape', async () => {
  mocks.fetchAsset.mockResolvedValueOnce([
    { base64: 'YQ==', mimeType: 'image/png', success: true, url: 'https://example.test/a.png' },
  ]);
  const successResponse = vi.fn();
  expect(
    handleFetchWebSnapshotAsset(
      { snapshotSessionId: 'session-1', urls: ['https://example.test/a.png'] },
      7,
      successResponse
    )
  ).toBe(true);
  await vi.waitFor(() => expect(successResponse).toHaveBeenCalledOnce());
  expect(successResponse).toHaveBeenCalledWith({ assets: expect.any(Array), success: true });

  mocks.fetchAsset.mockRejectedValueOnce(new Error('fetch rejected'));
  const failureResponse = vi.fn();
  handleFetchWebSnapshotAsset(
    { snapshotSessionId: 'session-1', urls: ['https://example.test/a.png'] },
    7,
    failureResponse
  );
  await vi.waitFor(() => expect(failureResponse).toHaveBeenCalledOnce());
  expect(failureResponse).toHaveBeenCalledWith({ error: 'fetch rejected', success: false });
});

it('creates and extends asset sessions with authoritative session identities', async () => {
  mocks.registerSession.mockReturnValue('session-1');
  const createResponse = vi.fn();
  handleRegisterWebSnapshotAssets(
    { assetUrls: ['https://example.test/a.png'], requestId: 'job-1' },
    7,
    createResponse
  );
  await vi.waitFor(() => expect(createResponse).toHaveBeenCalledOnce());
  expect(createResponse).toHaveBeenCalledWith({ snapshotSessionId: 'session-1', success: true });

  const extendResponse = vi.fn();
  handleRegisterWebSnapshotAssets(
    {
      assetUrls: ['https://example.test/b.png'],
      requestId: 'job-1',
      snapshotSessionId: 'session-1',
    },
    7,
    extendResponse
  );
  await vi.waitFor(() => expect(extendResponse).toHaveBeenCalledOnce());
  expect(mocks.extendSession).toHaveBeenCalledWith({
    assetUrls: ['https://example.test/b.png'],
    sessionId: 'session-1',
    tabId: 7,
  });
  expect(extendResponse).toHaveBeenCalledWith({ snapshotSessionId: 'session-1', success: true });
});

it('returns a canonical error when session registration fails', async () => {
  mocks.registerSession.mockImplementation(() => {
    throw new Error('registration rejected');
  });
  const sendResponse = vi.fn();

  handleRegisterWebSnapshotAssets({ assetUrls: [], requestId: 'job-1' }, 7, sendResponse);
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledOnce());

  expect(sendResponse).toHaveBeenCalledWith({ error: 'registration rejected', success: false });
});
