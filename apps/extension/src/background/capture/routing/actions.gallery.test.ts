import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  WebSnapshotManifest,
  WebSnapshotSaveToGalleryPayload,
} from '@sniptale/runtime-contracts/web-snapshot';

const {
  beginWebSnapshotSaveMock,
  commitWebSnapshotSaveMock,
  consumeWebSnapshotStagedBlobMock,
  fetchWebSnapshotAssetForSessionMock,
  releaseWebSnapshotStagedBlobsMock,
  releaseWebSnapshotSaveMock,
  registerWebSnapshotAssetSessionMock,
  saveScreenshotToMediaHubFromDataUrlMock,
  saveWebSnapshotToMediaHubMock,
  stageWebSnapshotBlobChunkMock,
} = vi.hoisted(() => ({
  beginWebSnapshotSaveMock: vi.fn(),
  commitWebSnapshotSaveMock: vi.fn(),
  consumeWebSnapshotStagedBlobMock: vi.fn(),
  fetchWebSnapshotAssetForSessionMock: vi.fn(),
  releaseWebSnapshotStagedBlobsMock: vi.fn(),
  releaseWebSnapshotSaveMock: vi.fn(),
  registerWebSnapshotAssetSessionMock: vi.fn(),
  saveScreenshotToMediaHubFromDataUrlMock: vi.fn(),
  saveWebSnapshotToMediaHubMock: vi.fn(),
  stageWebSnapshotBlobChunkMock: vi.fn(),
}));

vi.mock('../../media-hub/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media-hub/assets')>()),
  saveScreenshotToMediaHubFromDataUrl: saveScreenshotToMediaHubFromDataUrlMock,
}));

vi.mock('../../media-hub/web-snapshot', () => ({
  saveWebSnapshotToMediaHub: saveWebSnapshotToMediaHubMock,
}));

vi.mock('./web-snapshot/fetch', () => ({
  fetchWebSnapshotAssetForSession: fetchWebSnapshotAssetForSessionMock,
}));

vi.mock('./web-snapshot/session', () => ({
  assertWebSnapshotSessionOpen: vi.fn(),
  authorizeWebSnapshotAssetFetch: vi.fn(),
  authorizeWebSnapshotCaptureRequest: vi.fn(),
  beginWebSnapshotSave: beginWebSnapshotSaveMock,
  commitWebSnapshotSave: commitWebSnapshotSaveMock,
  releaseWebSnapshotSave: releaseWebSnapshotSaveMock,
  registerWebSnapshotAssetSession: registerWebSnapshotAssetSessionMock,
  resetWebSnapshotAssetSessionsForTests: vi.fn(),
}));

vi.mock('./web-snapshot/staged-blobs', () => ({
  consumeWebSnapshotStagedBlob: consumeWebSnapshotStagedBlobMock,
  releaseWebSnapshotStagedBlobs: releaseWebSnapshotStagedBlobsMock,
  resetWebSnapshotStagedBlobsForTests: vi.fn(),
  stageWebSnapshotBlobChunk: stageWebSnapshotBlobChunkMock,
}));

import {
  handleFetchWebSnapshotAsset,
  handleRegisterWebSnapshotAssets,
  handleSaveScreenshotToGallery,
  handleSaveWebSnapshotToGallery,
} from './actions.gallery';

function createWebSnapshotManifest(): WebSnapshotManifest {
  return {
    captureMode: 'readOnlyNoScripts',
    capturedAt: '2026-06-08T00:00:00.000Z',
    id: 'snapshot-session-1',
    paths: {
      computedStyles: 'logs/css/computed-styles.json',
      domSnapshot: 'logs/dom.html',
      errors: 'logs/errors.log',
      manifest: 'manifest.json',
      screenshot: 'page-screenshot.png',
      snapshotHtml: 'snapshot/index.html',
      stylesheets: 'logs/css/stylesheets.json',
      virtualDomSnapshot: 'logs/virtual-dom.html',
    },
    schemaVersion: 1,
    source: { faviconUrl: null, title: 'Example', url: 'https://example.com' },
    stats: { assetCount: 0, failedAssetCount: 0, packageSize: 1 },
    warnings: [],
  };
}

function createWebSnapshotSavePayload(): WebSnapshotSaveToGalleryPayload {
  return {
    manifest: createWebSnapshotManifest(),
    packageStagedBlobId: 'package-stage-1',
    screenshotMimeType: 'image/png',
    screenshotStagedBlobId: 'screenshot-stage-1',
    snapshotSessionId: 'snapshot-session-1',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  consumeWebSnapshotStagedBlobMock.mockImplementation(
    ({ expectedKind }: { expectedKind: 'package' | 'screenshot' }) =>
      new Blob([expectedKind], {
        type: expectedKind === 'package' ? 'application/x-sniptale-web-snapshot+zip' : 'image/png',
      })
  );
  fetchWebSnapshotAssetForSessionMock.mockResolvedValue({
    base64: 'c3Zn',
    mimeType: 'image/svg+xml',
  });
  registerWebSnapshotAssetSessionMock.mockReturnValue('snapshot-session-1');
  saveScreenshotToMediaHubFromDataUrlMock.mockResolvedValue('asset-1');
  saveWebSnapshotToMediaHubMock.mockResolvedValue('asset-web');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

it('saves screenshots into the gallery', async () => {
  const saveResponse = vi.fn();

  expect(
    handleSaveScreenshotToGallery(
      { dataUrl: 'data:image/png;base64,1', filename: 'gallery.png' },
      42,
      saveResponse
    )
  ).toBe(true);

  await flushPromises();

  expect(saveScreenshotToMediaHubFromDataUrlMock).toHaveBeenCalledWith(
    'data:image/png;base64,1',
    'gallery.png',
    42
  );
  expect(saveResponse).toHaveBeenCalledWith({ success: true, assetId: 'asset-1' });
});

it('saves web snapshot packages into the gallery', async () => {
  const saveResponse = vi.fn();
  const payload = createWebSnapshotSavePayload();

  expect(handleSaveWebSnapshotToGallery(payload, 42, saveResponse)).toBe(true);

  await flushPromises();

  expect(beginWebSnapshotSaveMock).toHaveBeenCalledWith({
    sessionId: 'snapshot-session-1',
    tabId: 42,
  });
  expect(saveWebSnapshotToMediaHubMock).toHaveBeenCalledWith({
    packageBlob: expect.any(Blob),
    payload,
    screenshotBlob: expect.any(Blob),
  });
  expect(commitWebSnapshotSaveMock).toHaveBeenCalledWith({
    sessionId: 'snapshot-session-1',
    tabId: 42,
  });
  expect(saveResponse).toHaveBeenCalledWith({ success: true, assetId: 'asset-web' });
});

it('registers web snapshot asset sessions for the resolved tab', async () => {
  const registerResponse = vi.fn();

  expect(
    handleRegisterWebSnapshotAssets(
      { assetUrls: ['https://cdn.example.com/image.png'], requestId: 'req-web' },
      42,
      registerResponse
    )
  ).toBe(true);

  await flushPromises();

  expect(registerWebSnapshotAssetSessionMock).toHaveBeenCalledWith(42, 'req-web', [
    'https://cdn.example.com/image.png',
  ]);
  expect(registerResponse).toHaveBeenCalledWith({
    success: true,
    snapshotSessionId: 'snapshot-session-1',
  });
});

it('fetches registered web snapshot assets anonymously', async () => {
  const assetResponse = vi.fn();

  expect(
    handleFetchWebSnapshotAsset(
      {
        snapshotSessionId: 'snapshot-session-1',
        url: 'https://upload.wikimedia.org/wikipedia/commons/html5.svg',
      },
      42,
      assetResponse
    )
  ).toBe(true);

  await flushPromises();

  expect(fetchWebSnapshotAssetForSessionMock).toHaveBeenCalledWith({
    sessionId: 'snapshot-session-1',
    tabId: 42,
    url: 'https://upload.wikimedia.org/wikipedia/commons/html5.svg',
  });
  expect(assetResponse).toHaveBeenCalledWith({
    success: true,
    base64: 'c3Zn',
    mimeType: 'image/svg+xml',
  });
});

it('reports web snapshot asset fetch failures through route errors', async () => {
  const assetResponse = vi.fn();
  fetchWebSnapshotAssetForSessionMock.mockRejectedValueOnce(
    new Error('unsupported asset URL protocol')
  );

  expect(
    handleFetchWebSnapshotAsset(
      { snapshotSessionId: 'snapshot-session-1', url: 'data:image/svg+xml;base64,1' },
      42,
      assetResponse
    )
  ).toBe(true);

  await flushPromises();

  expect(assetResponse).toHaveBeenCalledWith({
    success: false,
    error: 'unsupported asset URL protocol',
  });
});

it('reports screenshot save failures through route errors', async () => {
  const saveFailureResponse = vi.fn();

  saveScreenshotToMediaHubFromDataUrlMock.mockRejectedValueOnce(new Error('save failed'));

  expect(
    handleSaveScreenshotToGallery(
      { dataUrl: 'data:image/png;base64,9', filename: 'gallery.png' },
      42,
      saveFailureResponse
    )
  ).toBe(true);

  await flushPromises();

  expect(saveFailureResponse).toHaveBeenCalledWith({
    success: false,
    error: 'save failed',
  });
});

it('reports web snapshot save failures through route errors', async () => {
  const saveFailureResponse = vi.fn();

  saveWebSnapshotToMediaHubMock.mockRejectedValueOnce(new Error('snapshot failed'));

  expect(
    handleSaveWebSnapshotToGallery(createWebSnapshotSavePayload(), 42, saveFailureResponse)
  ).toBe(true);

  await flushPromises();

  expect(saveFailureResponse).toHaveBeenCalledWith({
    success: false,
    error: 'snapshot failed',
  });
  expect(releaseWebSnapshotSaveMock).toHaveBeenCalledWith({
    sessionId: 'snapshot-session-1',
    tabId: 42,
  });
  expect(releaseWebSnapshotStagedBlobsMock).toHaveBeenCalledWith({
    ...createWebSnapshotSavePayload(),
    tabId: 42,
  });
});
