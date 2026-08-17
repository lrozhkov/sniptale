import { beforeEach, expect, it, vi } from 'vitest';
import type {
  WebSnapshotManifest,
  WebSnapshotSaveToGalleryPayload,
} from '@sniptale/runtime-contracts/web-snapshot';

const {
  assertWebSnapshotSessionOpenMock,
  assertWebSnapshotSessionOwnerMock,
  beginWebSnapshotSaveMock,
  commitWebSnapshotSaveMock,
  consumeWebSnapshotStagedBlobMock,
  deleteMediaLibraryAssetsBatchSafelyMock,
  hasActivePageAccessMock,
  releaseWebSnapshotStagedBlobsMock,
  releaseWebSnapshotStagedBlobsForSessionMock,
  releaseWebSnapshotSaveMock,
  saveScreenshotToMediaHubFromDataUrlMock,
  saveWebSnapshotToMediaHubMock,
  stageWebSnapshotBlobChunkMock,
} = vi.hoisted(() => ({
  assertWebSnapshotSessionOpenMock: vi.fn(),
  assertWebSnapshotSessionOwnerMock: vi.fn(),
  beginWebSnapshotSaveMock: vi.fn(),
  commitWebSnapshotSaveMock: vi.fn(),
  consumeWebSnapshotStagedBlobMock: vi.fn(),
  deleteMediaLibraryAssetsBatchSafelyMock: vi.fn(),
  hasActivePageAccessMock: vi.fn(),
  releaseWebSnapshotStagedBlobsMock: vi.fn(),
  releaseWebSnapshotStagedBlobsForSessionMock: vi.fn(),
  releaseWebSnapshotSaveMock: vi.fn(),
  saveScreenshotToMediaHubFromDataUrlMock: vi.fn(),
  saveWebSnapshotToMediaHubMock: vi.fn(),
  stageWebSnapshotBlobChunkMock: vi.fn(),
}));

vi.mock('../../page-access/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../page-access/service')>()),
  hasActivePageAccess: hasActivePageAccessMock,
}));

vi.mock('../../media-hub/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../media-hub/assets')>()),
  saveScreenshotToMediaHubFromDataUrl: saveScreenshotToMediaHubFromDataUrlMock,
}));

vi.mock('../../media-hub/web-snapshot', () => ({
  saveWebSnapshotToMediaHub: saveWebSnapshotToMediaHubMock,
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  deleteMediaLibraryAssetsBatchSafely: deleteMediaLibraryAssetsBatchSafelyMock,
}));

vi.mock('./web-snapshot/fetch', () => ({
  fetchWebSnapshotAssetForSession: vi.fn(),
}));

vi.mock('./web-snapshot/session', () => ({
  assertWebSnapshotSessionOpen: assertWebSnapshotSessionOpenMock,
  assertWebSnapshotSessionOwner: assertWebSnapshotSessionOwnerMock,
  authorizeWebSnapshotAssetFetch: vi.fn(),
  authorizeWebSnapshotCaptureRequest: vi.fn(),
  beginWebSnapshotSave: beginWebSnapshotSaveMock,
  cancelWebSnapshotCaptureRequest: vi.fn(),
  commitWebSnapshotSave: commitWebSnapshotSaveMock,
  releaseWebSnapshotSave: releaseWebSnapshotSaveMock,
  registerWebSnapshotAssetSession: vi.fn(),
  resetWebSnapshotAssetSessionsForTests: vi.fn(),
}));

vi.mock('./web-snapshot/staged-blobs', () => ({
  consumeWebSnapshotStagedBlob: consumeWebSnapshotStagedBlobMock,
  releaseWebSnapshotStagedBlobs: releaseWebSnapshotStagedBlobsMock,
  releaseWebSnapshotStagedBlobsForSession: releaseWebSnapshotStagedBlobsForSessionMock,
  resetWebSnapshotStagedBlobsForTests: vi.fn(),
  stageWebSnapshotBlobChunk: stageWebSnapshotBlobChunkMock,
}));

import { handleSaveWebSnapshotToGallery, handleStageWebSnapshotBlobChunk } from './actions.gallery';
import { handleReleaseWebSnapshotStagedBlobs } from './actions.web-snapshot';

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
  hasActivePageAccessMock.mockResolvedValue(true);
  consumeWebSnapshotStagedBlobMock.mockImplementation(
    ({ expectedKind }: { expectedKind: 'package' | 'screenshot' }) =>
      new Blob([expectedKind], {
        type: expectedKind === 'package' ? 'application/x-sniptale-web-snapshot+zip' : 'image/png',
      })
  );
  saveWebSnapshotToMediaHubMock.mockResolvedValue('asset-web');
  deleteMediaLibraryAssetsBatchSafelyMock.mockResolvedValue(undefined);
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

it('releases only payload-owned staged refs when save-session ownership is not acquired', async () => {
  const saveFailureResponse = vi.fn();
  const payload = createStagedSavePayload();
  beginWebSnapshotSaveMock.mockImplementationOnce(() => {
    throw new Error('Invalid web snapshot session');
  });

  handleSaveWebSnapshotToGallery(payload, 42, saveFailureResponse);
  await flushPromises();

  expect(saveWebSnapshotToMediaHubMock).not.toHaveBeenCalled();
  expect(releaseWebSnapshotStagedBlobsMock).toHaveBeenCalledWith({ ...payload, tabId: 42 });
  expect(releaseWebSnapshotSaveMock).not.toHaveBeenCalled();
  expect(saveFailureResponse).toHaveBeenCalledWith({
    error: 'Invalid web snapshot session',
    success: false,
  });
});

it('releases all staged refs only after validating the tab-bound session owner', async () => {
  const response = vi.fn();

  expect(
    handleReleaseWebSnapshotStagedBlobs({ snapshotSessionId: 'snapshot-session-1' }, 42, response)
  ).toBe(true);
  await flushPromises();

  expect(assertWebSnapshotSessionOwnerMock).toHaveBeenCalledWith({
    sessionId: 'snapshot-session-1',
    tabId: 42,
  });
  expect(releaseWebSnapshotStagedBlobsForSessionMock).toHaveBeenCalledWith({
    snapshotSessionId: 'snapshot-session-1',
    tabId: 42,
  });
  expect(response).toHaveBeenCalledWith({ result: 'released', success: true });
});

it('does not release staged refs for a mismatched session owner', async () => {
  const response = vi.fn();
  assertWebSnapshotSessionOwnerMock.mockImplementationOnce(() => {
    throw new Error('Invalid web snapshot session');
  });

  handleReleaseWebSnapshotStagedBlobs(
    { snapshotSessionId: 'snapshot-session-other' },
    42,
    response
  );
  await flushPromises();

  expect(releaseWebSnapshotStagedBlobsForSessionMock).not.toHaveBeenCalled();
  expect(response).toHaveBeenCalledWith({
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

it('compensates the gallery write when cancellation wins the commit race', async () => {
  const response = vi.fn();
  const payload = createStagedSavePayload();
  commitWebSnapshotSaveMock.mockImplementationOnce(() => {
    throw new Error('Web snapshot save was cancelled');
  });

  handleSaveWebSnapshotToGallery(payload, 42, response);
  await flushPromises();

  expect(deleteMediaLibraryAssetsBatchSafelyMock).toHaveBeenCalledWith(['asset-web']);
  expect(response).toHaveBeenCalledWith({
    error: 'Web snapshot save was cancelled',
    success: false,
  });
});
