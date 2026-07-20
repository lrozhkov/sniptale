import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { hasPreauthorizedGalleryUpdateRouteMessageMock, updateGalleryImageAssetFromDataUrlMock } =
  vi.hoisted(() => ({
    hasPreauthorizedGalleryUpdateRouteMessageMock: vi.fn(),
    updateGalleryImageAssetFromDataUrlMock: vi.fn(),
  }));

vi.mock('../../media-hub/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media-hub/assets')>()),
  updateGalleryImageAssetFromDataUrl: updateGalleryImageAssetFromDataUrlMock,
}));

vi.mock('./authorization/gallery-update', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./authorization/gallery-update')>()),
  hasPreauthorizedGalleryUpdateRouteMessage: hasPreauthorizedGalleryUpdateRouteMessageMock,
}));

import {
  handleRequestGalleryImageUpdateCapability,
  handleUpdateGalleryImageAsset,
} from './actions.gallery';
import { resetGalleryImageUpdateCapabilitiesForTests } from './gallery-update-capabilities';

beforeEach(() => {
  vi.clearAllMocks();
  resetGalleryImageUpdateCapabilitiesForTests();
  vi.stubGlobal('crypto', { randomUUID: () => 'update-token-1' });
  hasPreauthorizedGalleryUpdateRouteMessageMock.mockReturnValue(true);
  updateGalleryImageAssetFromDataUrlMock.mockResolvedValue('asset-2');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function createEditorSender(
  assetId = 'asset-1',
  editorSessionId = 'session-1',
  documentId = 'document-1'
): chrome.runtime.MessageSender {
  return {
    documentId,
    url: `chrome-extension://test/apps/extension/src/editor/index.html?assetId=${assetId}&session=${editorSessionId}`,
  };
}

it('updates existing gallery assets with a matching one-shot capability', async () => {
  const response = vi.fn();
  const sender = createEditorSender();

  handleRequestGalleryImageUpdateCapability(
    { assetId: 'asset-1', editorSessionId: 'session-1' },
    sender,
    vi.fn()
  );

  expect(
    handleUpdateGalleryImageAsset(
      {
        assetId: 'asset-1',
        dataUrl: 'data:image/png;base64,2',
        editorSessionId: 'session-1',
        filename: 'edited.png',
        updateCapabilityToken: 'update-token-1',
      },
      sender,
      response
    )
  ).toBe(true);

  await flushPromises();

  expect(updateGalleryImageAssetFromDataUrlMock).toHaveBeenCalledWith(
    'asset-1',
    'data:image/png;base64,2',
    'edited.png'
  );
  expect(response).toHaveBeenCalledWith({ success: true, assetId: 'asset-2' });
});

it('rejects gallery update capabilities for mismatched editor bootstrap state', () => {
  const response = vi.fn();

  expect(
    handleRequestGalleryImageUpdateCapability(
      { assetId: 'asset-2', editorSessionId: 'session-1' },
      createEditorSender(),
      response
    )
  ).toBe(true);

  expect(response).toHaveBeenCalledWith({
    error: 'Unauthorized gallery image update capability request',
    success: false,
  });
});

it('rejects gallery update capability requests without sender document identity', () => {
  const response = vi.fn();

  expect(
    handleRequestGalleryImageUpdateCapability(
      { assetId: 'asset-1', editorSessionId: 'session-1' },
      {
        url: 'chrome-extension://test/apps/extension/src/editor/index.html?assetId=asset-1&session=session-1',
      },
      response
    )
  ).toBe(true);

  expect(response).toHaveBeenCalledWith({
    error: 'Unauthorized gallery image update capability request',
    success: false,
  });
});

it('rejects gallery updates that were not preauthorized by the capability facade', () => {
  const response = vi.fn();
  hasPreauthorizedGalleryUpdateRouteMessageMock.mockReturnValue(false);

  expect(
    handleUpdateGalleryImageAsset(
      {
        assetId: 'asset-1',
        dataUrl: 'data:image/png;base64,2',
        editorSessionId: 'session-1',
        updateCapabilityToken: 'wrong-token',
      },
      createEditorSender(),
      response
    )
  ).toBe(true);

  expect(updateGalleryImageAssetFromDataUrlMock).not.toHaveBeenCalled();
  expect(response).toHaveBeenCalledWith({
    error: 'Unauthorized gallery image update',
    success: false,
  });
});

it('rejects gallery updates without facade sender authorization', () => {
  const response = vi.fn();
  hasPreauthorizedGalleryUpdateRouteMessageMock.mockReturnValue(false);

  handleRequestGalleryImageUpdateCapability(
    { assetId: 'asset-1', editorSessionId: 'session-1' },
    createEditorSender(),
    vi.fn()
  );

  expect(
    handleUpdateGalleryImageAsset(
      {
        assetId: 'asset-1',
        dataUrl: 'data:image/png;base64,2',
        editorSessionId: 'session-1',
        updateCapabilityToken: 'update-token-1',
      },
      {
        url: 'chrome-extension://test/apps/extension/src/editor/index.html?assetId=asset-1&session=session-1',
      },
      response
    )
  ).toBe(true);

  expect(updateGalleryImageAssetFromDataUrlMock).not.toHaveBeenCalled();
  expect(response).toHaveBeenCalledWith({
    error: 'Unauthorized gallery image update',
    success: false,
  });
});

it('reports gallery update failures through route errors after capability validation', async () => {
  const response = vi.fn();
  const sender = createEditorSender('asset-9', 'session-9', 'document-9');

  updateGalleryImageAssetFromDataUrlMock.mockRejectedValueOnce(new Error('update failed'));
  handleRequestGalleryImageUpdateCapability(
    { assetId: 'asset-9', editorSessionId: 'session-9' },
    sender,
    vi.fn()
  );

  expect(
    handleUpdateGalleryImageAsset(
      {
        assetId: 'asset-9',
        dataUrl: 'data:image/png;base64,10',
        editorSessionId: 'session-9',
        filename: 'edited.png',
        updateCapabilityToken: 'update-token-1',
      },
      sender,
      response
    )
  ).toBe(true);

  await flushPromises();

  expect(response).toHaveBeenCalledWith({
    error: 'update failed',
    success: false,
  });
});

it('rejects replayed gallery update capabilities', async () => {
  const firstResponse = vi.fn();
  const replayResponse = vi.fn();
  const sender = createEditorSender();
  hasPreauthorizedGalleryUpdateRouteMessageMock
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(false);

  handleRequestGalleryImageUpdateCapability(
    { assetId: 'asset-1', editorSessionId: 'session-1' },
    sender,
    vi.fn()
  );

  handleUpdateGalleryImageAsset(
    {
      assetId: 'asset-1',
      dataUrl: 'data:image/png;base64,2',
      editorSessionId: 'session-1',
      updateCapabilityToken: 'update-token-1',
    },
    sender,
    firstResponse
  );
  await flushPromises();

  handleUpdateGalleryImageAsset(
    {
      assetId: 'asset-1',
      dataUrl: 'data:image/png;base64,3',
      editorSessionId: 'session-1',
      updateCapabilityToken: 'update-token-1',
    },
    sender,
    replayResponse
  );

  expect(updateGalleryImageAssetFromDataUrlMock).toHaveBeenCalledTimes(1);
  expect(replayResponse).toHaveBeenCalledWith({
    error: 'Unauthorized gallery image update',
    success: false,
  });
});
