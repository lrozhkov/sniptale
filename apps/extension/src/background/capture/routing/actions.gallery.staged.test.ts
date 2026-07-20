import { beforeEach, expect, it, vi } from 'vitest';
import type {
  WebSnapshotManifest,
  WebSnapshotSaveToGalleryPayload,
} from '@sniptale/runtime-contracts/web-snapshot';

const {
  assertWebSnapshotSessionOpenMock,
  beginWebSnapshotSaveMock,
  commitWebSnapshotSaveMock,
  consumeWebSnapshotStagedBlobMock,
  releaseWebSnapshotStagedBlobsMock,
  releaseWebSnapshotSaveMock,
  saveScreenshotToMediaHubFromDataUrlMock,
  saveWebSnapshotToMediaHubMock,
  stageWebSnapshotBlobChunkMock,
} = vi.hoisted(() => ({
  assertWebSnapshotSessionOpenMock: vi.fn(),
  beginWebSnapshotSaveMock: vi.fn(),
  commitWebSnapshotSaveMock: vi.fn(),
  consumeWebSnapshotStagedBlobMock: vi.fn(),
  releaseWebSnapshotStagedBlobsMock: vi.fn(),
  releaseWebSnapshotSaveMock: vi.fn(),
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
  fetchWebSnapshotAssetForSession: vi.fn(),
}));

vi.mock('./web-snapshot/session', () => ({
  assertWebSnapshotSessionOpen: assertWebSnapshotSessionOpenMock,
  authorizeWebSnapshotAssetFetch: vi.fn(),
  authorizeWebSnapshotCaptureRequest: vi.fn(),
  beginWebSnapshotSave: beginWebSnapshotSaveMock,
  commitWebSnapshotSave: commitWebSnapshotSaveMock,
  releaseWebSnapshotSave: releaseWebSnapshotSaveMock,
  registerWebSnapshotAssetSession: vi.fn(),
  resetWebSnapshotAssetSessionsForTests: vi.fn(),
}));

vi.mock('./web-snapshot/staged-blobs', () => ({
  consumeWebSnapshotStagedBlob: consumeWebSnapshotStagedBlobMock,
  releaseWebSnapshotStagedBlobs: releaseWebSnapshotStagedBlobsMock,
  resetWebSnapshotStagedBlobsForTests: vi.fn(),
  stageWebSnapshotBlobChunk: stageWebSnapshotBlobChunkMock,
}));

import { handleSaveWebSnapshotToGallery, handleStageWebSnapshotBlobChunk } from './actions.gallery';

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

function createStagedSavePayload(): WebSnapshotSaveToGalleryPayload {
  return {
    manifest: createWebSnapshotManifest(),
    packageStagedBlobId: 'package-stage-1',
    screenshotMimeType: 'image/png',
    screenshotStagedBlobId: 'screenshot-stage-1',
    snapshotSessionId: 'snapshot-session-1',
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  consumeWebSnapshotStagedBlobMock.mockImplementation(
    ({ expectedKind }: { expectedKind: 'package' | 'screenshot' }) =>
      new Blob([expectedKind], {
        type: expectedKind === 'package' ? 'application/x-sniptale-web-snapshot+zip' : 'image/png',
      })
  );
  saveWebSnapshotToMediaHubMock.mockResolvedValue('asset-web');
  stageWebSnapshotBlobChunkMock.mockReturnValue({
    complete: true,
    stagedBlobId: 'stage-package-1',
  });
});

it('stages web snapshot chunks only after tab-bound session authorization', async () => {
  const stageResponse = vi.fn();

  expect(
    handleStageWebSnapshotBlobChunk(
      {
        base64: 'emlw',
        blobKind: 'package',
        chunkIndex: 0,
        snapshotSessionId: 'snapshot-session-1',
        stagedBlobId: 'stage-package-1',
        totalBytes: 3,
        totalChunks: 1,
      },
      42,
      stageResponse
    )
  ).toBe(true);

  await flushPromises();

  expect(assertWebSnapshotSessionOpenMock).toHaveBeenCalledWith({
    sessionId: 'snapshot-session-1',
    tabId: 42,
  });
  expect(stageWebSnapshotBlobChunkMock).toHaveBeenCalledWith(
    expect.objectContaining({ stagedBlobId: 'stage-package-1', tabId: 42 })
  );
  expect(stageResponse).toHaveBeenCalledWith({
    complete: true,
    stagedBlobId: 'stage-package-1',
    success: true,
  });
});

it('rejects web snapshot chunks before allocation when the session is invalid', async () => {
  const stageResponse = vi.fn();
  assertWebSnapshotSessionOpenMock.mockImplementationOnce(() => {
    throw new Error('Invalid web snapshot session');
  });

  handleStageWebSnapshotBlobChunk(
    {
      base64: 'emlw',
      blobKind: 'package',
      chunkIndex: 0,
      snapshotSessionId: 'snapshot-session-1',
      stagedBlobId: 'stage-package-1',
      totalBytes: 3,
      totalChunks: 1,
    },
    42,
    stageResponse
  );

  await flushPromises();

  expect(stageWebSnapshotBlobChunkMock).not.toHaveBeenCalled();
  expect(stageResponse).toHaveBeenCalledWith({
    error: 'Invalid web snapshot session',
    success: false,
  });
});

it('does not release staged refs when save-session ownership is not acquired', async () => {
  const saveFailureResponse = vi.fn();
  const payload = createStagedSavePayload();
  beginWebSnapshotSaveMock.mockImplementationOnce(() => {
    throw new Error('Invalid web snapshot session');
  });

  handleSaveWebSnapshotToGallery(payload, 42, saveFailureResponse);
  await flushPromises();

  expect(saveWebSnapshotToMediaHubMock).not.toHaveBeenCalled();
  expect(releaseWebSnapshotStagedBlobsMock).not.toHaveBeenCalled();
  expect(releaseWebSnapshotSaveMock).not.toHaveBeenCalled();
  expect(saveFailureResponse).toHaveBeenCalledWith({
    error: 'Invalid web snapshot session',
    success: false,
  });
});

it('preserves staged resolution failure copy and releases acquired save ownership', async () => {
  const response = vi.fn();
  const payload = createStagedSavePayload();
  consumeWebSnapshotStagedBlobMock.mockImplementationOnce(() => {
    throw new Error('Web snapshot staged payload is missing or incomplete');
  });

  handleSaveWebSnapshotToGallery(payload, 42, response);
  await flushPromises();

  expect(saveWebSnapshotToMediaHubMock).not.toHaveBeenCalled();
  expect(releaseWebSnapshotStagedBlobsMock).toHaveBeenCalledWith({ ...payload, tabId: 42 });
  expect(releaseWebSnapshotSaveMock).toHaveBeenCalledWith({
    sessionId: payload.snapshotSessionId,
    tabId: 42,
  });
  expect(response).toHaveBeenCalledWith({
    error:
      'resolve web snapshot payload blobs: Web snapshot staged payload is missing or incomplete',
    success: false,
  });
});

it('releases staged web snapshot refs even when save-session rollback fails', async () => {
  const saveFailureResponse = vi.fn();
  const payload = createStagedSavePayload();
  saveWebSnapshotToMediaHubMock.mockRejectedValueOnce(new Error('snapshot failed'));
  releaseWebSnapshotSaveMock.mockImplementationOnce(() => {
    throw new Error('Invalid web snapshot session');
  });

  handleSaveWebSnapshotToGallery(payload, 42, saveFailureResponse);
  await flushPromises();

  expect(releaseWebSnapshotStagedBlobsMock).toHaveBeenCalledWith({
    ...payload,
    tabId: 42,
  });
  expect(saveFailureResponse).toHaveBeenCalledWith({
    error: 'snapshot failed',
    success: false,
  });
});
