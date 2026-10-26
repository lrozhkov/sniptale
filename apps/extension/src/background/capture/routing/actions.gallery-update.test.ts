vi.mock('../quick-actions/appearance', () => ({ beginPageAppearance: beginPageAppearanceMock }));
import { beforeEach, expect, it, vi } from 'vitest';

const {
  beginPageAppearanceMock,
  issueRecentCaptureEditorAssetCapabilityMock,
  loadSettingsMock,
  saveScreenshotToMediaHubFromDataUrlMock,
} = vi.hoisted(() => ({
  beginPageAppearanceMock: vi.fn(),
  issueRecentCaptureEditorAssetCapabilityMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  saveScreenshotToMediaHubFromDataUrlMock: vi.fn(),
}));

vi.mock('../../media-hub/assets', () => ({
  saveScreenshotToMediaHubFromDataUrl: saveScreenshotToMediaHubFromDataUrlMock,
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: loadSettingsMock,
}));

vi.mock('../editor/recent-asset-capability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../editor/recent-asset-capability')>()),
  issueRecentCaptureEditorAssetCapability: issueRecentCaptureEditorAssetCapabilityMock,
}));

import { handleSaveScreenshotToGallery } from './actions.gallery-update';

beforeEach(() => {
  vi.clearAllMocks();
  beginPageAppearanceMock.mockReturnValue({ assertCurrent() {}, release() {} });
  loadSettingsMock.mockResolvedValue({
    localStoragePolicy: { defaultDestination: 'temporary' },
  });
  saveScreenshotToMediaHubFromDataUrlMock.mockResolvedValue('asset-1');
  issueRecentCaptureEditorAssetCapabilityMock.mockReturnValue({
    requestId: 'save-request-1',
    token: 'editor-token-1',
  });
});

it('issues an exact editor asset capability after an authorized save succeeds', async () => {
  const message = { dataUrl: 'data:image/png;base64,1', filename: 'capture.png' };
  const authorization = {
    documentId: 'document-1',
    frameId: 0,
    libraryDestinationAuthorized: true as const,
    requestId: 'save-request-1',
    senderUrl: 'https://example.test/page',
    tabId: 42,
  };
  const sendResponse = vi.fn();

  expect(handleSaveScreenshotToGallery(message, 42, sendResponse, authorization)).toBe(true);
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(saveScreenshotToMediaHubFromDataUrlMock).toHaveBeenCalledWith(
    message.dataUrl,
    message.filename,
    42,
    'library'
  );
  expect(issueRecentCaptureEditorAssetCapabilityMock).toHaveBeenCalledWith({
    assetId: 'asset-1',
    requestId: 'save-request-1',
    senderBinding: authorization,
  });
  expect(sendResponse).toHaveBeenCalledWith({
    assetId: 'asset-1',
    editorAssetCapability: { requestId: 'save-request-1', token: 'editor-token-1' },
    success: true,
  });
});

it('does not issue content-bound editor authority for a save without content preauthorization', async () => {
  const sendResponse = vi.fn();

  handleSaveScreenshotToGallery(
    { dataUrl: 'data:image/png;base64,1', filename: 'capture.png' },
    42,
    sendResponse
  );
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

  expect(issueRecentCaptureEditorAssetCapabilityMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith({ assetId: 'asset-1', success: true });
});

it('publishes and returns the same prepared selection image and filename', async () => {
  let resolve!: (value: { dataUrl: string; filename: string }) => void;
  const prepare = vi.fn(
    () =>
      new Promise<{ dataUrl: string; filename: string }>((accept) => {
        resolve = accept;
      })
  );
  const release = vi.fn();
  beginPageAppearanceMock.mockReturnValue({ prepare, assertCurrent() {}, release });
  const sendResponse = vi.fn();
  handleSaveScreenshotToGallery(
    { dataUrl: 'raw', filename: 'raw.png', quickActionTransactionId: 'tx-1' },
    7,
    sendResponse
  );
  expect(beginPageAppearanceMock).toHaveBeenCalledWith(7, 'tx-1');
  expect(saveScreenshotToMediaHubFromDataUrlMock).not.toHaveBeenCalled();
  resolve({ dataUrl: 'styled', filename: 'styled.webp' });
  await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
  expect(saveScreenshotToMediaHubFromDataUrlMock).toHaveBeenCalledWith(
    'styled',
    'styled.webp',
    7,
    'temporary'
  );
  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    assetId: 'asset-1',
    dataUrl: 'styled',
    filename: 'styled.webp',
  });
});
it('refuses publication when erasure invalidates admission during settings load', async () => {
  let resolve!: (value: { localStoragePolicy: { defaultDestination: 'temporary' } }) => void;
  loadSettingsMock.mockReturnValue(
    new Promise((accept) => {
      resolve = accept;
    })
  );
  let current = true;
  const release = vi.fn();
  beginPageAppearanceMock.mockReturnValue({
    prepare: async () => ({ dataUrl: 'styled', filename: 'styled.png' }),
    assertCurrent() {
      if (!current) throw new Error('appearance cancelled');
    },
    release,
  });
  const sendResponse = vi.fn();
  handleSaveScreenshotToGallery(
    { dataUrl: 'raw', filename: 'raw.png', quickActionTransactionId: 'tx-1' },
    7,
    sendResponse
  );
  await vi.waitFor(() => expect(loadSettingsMock).toHaveBeenCalledOnce());
  current = false;
  resolve({ localStoragePolicy: { defaultDestination: 'temporary' } });
  await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
  expect(saveScreenshotToMediaHubFromDataUrlMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
});
