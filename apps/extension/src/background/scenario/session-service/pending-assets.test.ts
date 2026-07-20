import { beforeEach, expect, it, vi } from 'vitest';

const {
  blobToDataUrlMock,
  dataUrlToBlobMock,
  deletePendingScenarioAssetMock,
  getPendingScenarioAssetMock,
  savePendingScenarioAssetMock,
} = vi.hoisted(() => ({
  blobToDataUrlMock: vi.fn(),
  dataUrlToBlobMock: vi.fn(),
  deletePendingScenarioAssetMock: vi.fn(),
  getPendingScenarioAssetMock: vi.fn(),
  savePendingScenarioAssetMock: vi.fn(),
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: blobToDataUrlMock,
  dataUrlToBlob: dataUrlToBlobMock,
}));

vi.mock('../../../composition/persistence/scenario/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/scenario/projects')>()),
  deletePendingScenarioAsset: deletePendingScenarioAssetMock,
  getPendingScenarioAsset: getPendingScenarioAssetMock,
  savePendingScenarioAsset: savePendingScenarioAssetMock,
}));

import {
  clearPendingScenarioCaptureAsset,
  resolvePendingScenarioCapture,
  stagePendingScenarioCapture,
} from './pending-assets';
import {
  createPendingScenarioCaptureInput,
  createStoredPendingScenarioCapture,
} from './test-support';

beforeEach(() => {
  vi.clearAllMocks();
  dataUrlToBlobMock.mockResolvedValue(new Blob(['pending'], { type: 'image/png' }));
  blobToDataUrlMock.mockResolvedValue('data:image/png;base64,resolved');
  savePendingScenarioAssetMock.mockResolvedValue(undefined);
  getPendingScenarioAssetMock.mockResolvedValue({
    id: 'pending-asset-1',
    tabId: 5,
    galleryAssetId: 'gallery-1',
    blob: new Blob(['pending'], { type: 'image/png' }),
    mimeType: 'image/png',
    createdAt: 123,
    size: 7,
  });
  deletePendingScenarioAssetMock.mockResolvedValue(undefined);
});

it('stages a pending capture blob in the scenario temp asset store', async () => {
  const capture = createPendingScenarioCaptureInput();

  const staged = await stagePendingScenarioCapture(5, capture);

  expect(dataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,1');
  expect(savePendingScenarioAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({
      tabId: 5,
      galleryAssetId: 'gallery-1',
      mimeType: 'image/png',
    })
  );
  expect(staged).toEqual(
    expect.objectContaining({
      id: 'pending-1',
      pendingAssetId: expect.any(String),
      filename: 'capture.png',
    })
  );
});

it('omits capture metadata when staging a capture without metadata', async () => {
  const { captureMetadata: _captureMetadata, ...captureWithoutMetadata } =
    createPendingScenarioCaptureInput();
  const staged = await stagePendingScenarioCapture(5, {
    ...captureWithoutMetadata,
  });

  expect(staged).toEqual(
    expect.not.objectContaining({
      captureMetadata: expect.anything(),
    })
  );
});

it('falls back to image/png when the staged blob has no mime type', async () => {
  dataUrlToBlobMock.mockResolvedValue(new Blob(['pending']));

  await stagePendingScenarioCapture(5, createPendingScenarioCaptureInput());

  expect(savePendingScenarioAssetMock).toHaveBeenCalledWith(
    expect.objectContaining({
      mimeType: 'image/png',
    })
  );
});

it('resolves a pending capture from the staged temp asset', async () => {
  const pendingCapture = createStoredPendingScenarioCapture();

  const resolved = await resolvePendingScenarioCapture(pendingCapture);

  expect(getPendingScenarioAssetMock).toHaveBeenCalledWith('pending-asset-1');
  expect(blobToDataUrlMock).toHaveBeenCalled();
  expect(resolved).toEqual({
    ...pendingCapture,
    dataUrl: 'data:image/png;base64,resolved',
  });
});

it('returns null when the staged temp asset is missing', async () => {
  getPendingScenarioAssetMock.mockResolvedValue(undefined);

  await expect(
    resolvePendingScenarioCapture(createStoredPendingScenarioCapture())
  ).resolves.toBeNull();
});

it('returns null when the staged temp asset exists without a blob payload', async () => {
  getPendingScenarioAssetMock.mockResolvedValue({
    ...createStoredPendingScenarioCapture(),
    blob: null,
  });

  await expect(
    resolvePendingScenarioCapture(createStoredPendingScenarioCapture())
  ).resolves.toBeNull();
});

it('removes a pending temp asset by reference', async () => {
  await clearPendingScenarioCaptureAsset(createStoredPendingScenarioCapture());

  expect(deletePendingScenarioAssetMock).toHaveBeenCalledWith('pending-asset-1');
});

it('skips temp-asset deletion when no pending capture is provided', async () => {
  await clearPendingScenarioCaptureAsset(null);

  expect(deletePendingScenarioAssetMock).not.toHaveBeenCalled();
});
