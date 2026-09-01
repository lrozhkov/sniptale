import { beforeEach, expect, it, vi } from 'vitest';

const {
  getPreauthorizedContentActionRouteMessageMock,
  issueRecentCaptureEditorAssetCapabilityMock,
  loadSettingsMock,
  saveScreenshotToMediaHubFromDataUrlMock,
} = vi.hoisted(() => ({
  getPreauthorizedContentActionRouteMessageMock: vi.fn(),
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

vi.mock('./authorization/content-action', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./authorization/content-action')>()),
  getPreauthorizedContentActionRouteMessage: getPreauthorizedContentActionRouteMessageMock,
}));

vi.mock('../editor/recent-asset-capability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../editor/recent-asset-capability')>()),
  issueRecentCaptureEditorAssetCapability: issueRecentCaptureEditorAssetCapabilityMock,
}));

import { handleSaveScreenshotToGallery } from './actions.gallery-update';

beforeEach(() => {
  vi.clearAllMocks();
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
  getPreauthorizedContentActionRouteMessageMock.mockReturnValue(authorization);
  const sendResponse = vi.fn();

  expect(handleSaveScreenshotToGallery(message, 42, sendResponse)).toBe(true);
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
  getPreauthorizedContentActionRouteMessageMock.mockReturnValue(undefined);
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
