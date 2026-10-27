const { finalizeScreenshotDataUrlMock } = vi.hoisted(() => ({
  finalizeScreenshotDataUrlMock: vi.fn(async (dataUrl: string, options: { format: string }) =>
    options.format === 'png' ? dataUrl : `data:image/${options.format};base64,final`
  ),
}));
vi.mock('../../../platform/media-utils/screenshot-encoding', () => ({
  finalizeScreenshotDataUrl: finalizeScreenshotDataUrlMock,
  optimizeScreenshotDataUrl: vi.fn(async (dataUrl: string) => dataUrl),
}));
vi.mock('../quick-actions/flow/surface', () => ({
  getQuickActionAppearanceSnapshot: vi.fn(() => ({ imageFormat: 'webp', imageQuality: 61 })),
}));
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
import { reserveMediaErasureExclusion } from '../../mutation-exclusion/media-activity';

beforeEach(() => {
  vi.clearAllMocks();
  beginPageAppearanceMock.mockReturnValue({ assertCurrent() {}, release() {} });
  loadSettingsMock.mockResolvedValue({
    imageFormat: 'png',
    imageQuality: 90,
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
    dataUrl: message.dataUrl,
    filename: message.filename,
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
  expect(sendResponse).toHaveBeenCalledWith({
    assetId: 'asset-1',
    success: true,
    dataUrl: 'data:image/png;base64,1',
    filename: 'capture.png',
  });
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

it.each(['jpeg', 'webp'] as const)(
  'stores and returns the requested %s selection format',
  async (imageFormat) => {
    loadSettingsMock.mockResolvedValue({
      imageFormat,
      imageQuality: 72,
      captureAction: 'download_default',
      localStoragePolicy: { defaultDestination: 'temporary' },
    });
    const sendResponse = vi.fn();
    handleSaveScreenshotToGallery(
      { dataUrl: 'data:image/png;base64,crop', filename: 'selection.png' },
      42,
      sendResponse
    );
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
    expect(saveScreenshotToMediaHubFromDataUrlMock).toHaveBeenCalledWith(
      `data:image/${imageFormat};base64,final`,
      `selection.${imageFormat === 'jpeg' ? 'jpg' : 'webp'}`,
      42,
      'temporary'
    );
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        dataUrl: `data:image/${imageFormat};base64,final`,
        filename: `selection.${imageFormat === 'jpeg' ? 'jpg' : 'webp'}`,
      })
    );
  }
);

it('keeps quick action format and quality overrides for unstyled selections', async () => {
  const sendResponse = vi.fn();
  handleSaveScreenshotToGallery(
    {
      dataUrl: 'data:image/png;base64,crop',
      filename: 'selection.png',
      quickActionTransactionId: 'tx',
    },
    42,
    sendResponse
  );
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  expect(finalizeScreenshotDataUrlMock).toHaveBeenCalledWith('data:image/png;base64,crop', {
    format: 'webp',
    quality: 61,
  });
});

it('does not persist an image when mandatory final format encoding fails', async () => {
  finalizeScreenshotDataUrlMock.mockRejectedValueOnce(new Error('encode failed'));
  const sendResponse = vi.fn();
  handleSaveScreenshotToGallery(
    { dataUrl: 'data:image/png;base64,crop', filename: 'selection.png' },
    42,
    sendResponse
  );
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  expect(saveScreenshotToMediaHubFromDataUrlMock).not.toHaveBeenCalled();
  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({ success: false, error: 'encode failed' })
  );
});

it('preserves a lossless clipboard selection when the local action overrides JPEG settings', async () => {
  loadSettingsMock.mockResolvedValue({
    imageFormat: 'jpeg',
    imageQuality: 72,
    captureAction: 'download_default',
    localStoragePolicy: { defaultDestination: 'temporary' },
  });
  const sendResponse = vi.fn();
  handleSaveScreenshotToGallery(
    { dataUrl: 'data:image/png;base64,crop', filename: 'selection.jpg', actionType: 'copy' },
    42,
    sendResponse
  );
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  expect(finalizeScreenshotDataUrlMock).toHaveBeenCalledWith('data:image/png;base64,crop', {
    format: 'png',
    quality: 72,
  });
  expect(saveScreenshotToMediaHubFromDataUrlMock).toHaveBeenCalledWith(
    'data:image/png;base64,crop',
    'selection.png',
    42,
    'temporary'
  );
  expect(sendResponse).toHaveBeenCalledWith(
    expect.objectContaining({ dataUrl: 'data:image/png;base64,crop', filename: 'selection.png' })
  );
});

it('requests PNG appearance output before rendering a local clipboard override', async () => {
  beginPageAppearanceMock.mockImplementation(
    (_tabId: number, _transactionId: string, format: string) => ({
      prepare: async () => ({
        dataUrl: `data:image/${format};base64,styled`,
        filename: `selection.${format}`,
      }),
      assertCurrent() {},
      release() {},
    })
  );
  const sendResponse = vi.fn();
  handleSaveScreenshotToGallery(
    {
      dataUrl: 'data:image/png;base64,crop',
      filename: 'selection.jpg',
      actionType: 'copy',
      quickActionTransactionId: 'tx',
    },
    42,
    sendResponse
  );
  await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());
  expect(beginPageAppearanceMock).toHaveBeenCalledWith(42, 'tx', 'png');
  expect(saveScreenshotToMediaHubFromDataUrlMock).toHaveBeenCalledWith(
    'data:image/png;base64,styled',
    'selection.png',
    42,
    'temporary'
  );
  expect(finalizeScreenshotDataUrlMock).not.toHaveBeenCalled();
});

it('refuses to publish a no-appearance screenshot when erasure begins during encoding', async () => {
  let resume!: (value: string) => void;
  let started!: () => void;
  const encodingStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  finalizeScreenshotDataUrlMock.mockImplementationOnce(() => {
    started();
    return new Promise<string>((resolve) => {
      resume = resolve;
    });
  });
  const response = vi.fn();
  handleSaveScreenshotToGallery(
    { dataUrl: 'data:image/png;base64,old', filename: 'old.png' },
    42,
    response
  );
  await encodingStarted;
  const erasure = reserveMediaErasureExclusion();
  let drained = false;
  const drain = erasure.waitForActiveMutations().then(() => {
    drained = true;
  });
  try {
    await Promise.resolve();
    expect(drained).toBe(false);
    resume('data:image/png;base64,old');
    await vi.waitFor(() => expect(response).toHaveBeenCalled());
    await drain;
    expect(saveScreenshotToMediaHubFromDataUrlMock).not.toHaveBeenCalled();
    expect(response).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  } finally {
    resume('data:image/png;base64,old');
    erasure.release();
  }
});

it('refuses no-appearance encoding while erasure is reserved and admits a new retry after release', async () => {
  const erasure = reserveMediaErasureExclusion();
  const response = vi.fn();
  const payload = { dataUrl: 'data:image/png;base64,new', filename: 'new.png' };
  try {
    handleSaveScreenshotToGallery(payload, 42, response);
    await vi.waitFor(() => expect(response).toHaveBeenCalled());
    expect(response).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    expect(finalizeScreenshotDataUrlMock).not.toHaveBeenCalled();
    expect(saveScreenshotToMediaHubFromDataUrlMock).not.toHaveBeenCalled();
  } finally {
    erasure.release();
  }
  const retry = vi.fn();
  handleSaveScreenshotToGallery(payload, 42, retry);
  await vi.waitFor(() => expect(retry).toHaveBeenCalled());
  expect(retry).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
});

it('releases preparation admission after an encoding failure without publishing pixels', async () => {
  finalizeScreenshotDataUrlMock.mockRejectedValueOnce(new Error('Encoder failed'));
  const response = vi.fn();
  handleSaveScreenshotToGallery(
    { dataUrl: 'data:image/png;base64,old', filename: 'old.png' },
    42,
    response
  );
  await vi.waitFor(() => expect(response).toHaveBeenCalled());
  expect(response).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  expect(saveScreenshotToMediaHubFromDataUrlMock).not.toHaveBeenCalled();
  const erasure = reserveMediaErasureExclusion();
  try {
    await erasure.waitForActiveMutations();
  } finally {
    erasure.release();
  }
});
