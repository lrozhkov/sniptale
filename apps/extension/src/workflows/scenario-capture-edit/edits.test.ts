import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGuideImageBlock } from '../../features/scenario/project/public';

const { dataUrlToBlobMock, measureImageBlobMock, writeBlobToAssetMock } = vi.hoisted(() => ({
  dataUrlToBlobMock: vi.fn(),
  measureImageBlobMock: vi.fn(),
  writeBlobToAssetMock: vi.fn(),
}));

vi.mock('../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/assets')>()),
  assertAssetWriteAdmission: vi.fn(async () => undefined),
  writeBlobToAsset: writeBlobToAssetMock,
}));

vi.mock('../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/media-utils/data-url')>()),
  dataUrlToBlob: dataUrlToBlobMock,
}));

vi.mock('@sniptale/platform/browser/media/image-dimensions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/media/image-dimensions')>()),
  measureImageBlob: measureImageBlobMock,
}));

import { buildScenarioEditedImageBlock, prepareScenarioEditedCaptureAsset } from './edits';

function registerCaptureStepEditsScope() {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(123);
    dataUrlToBlobMock.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    measureImageBlobMock.mockResolvedValue({ width: 1440, height: 900 });
    writeBlobToAssetMock.mockImplementation(async (blob: Blob, options: { mimeType: string }) => ({
      ref: {
        assetId: 'opfs-edited-asset',
        createdAt: 1,
        location: { kind: 'opfs', objectKey: 'objects/opfs-edited-asset' },
        mimeType: options.mimeType,
        sha256: null,
        size: blob.size,
      },
    }));
  });
}

async function verifiesEditedAssetCreation() {
  const prepared = await prepareScenarioEditedCaptureAsset({
    dataUrl: 'data:image/png;base64,abc',
    galleryAssetId: 'gallery-1',
    projectId: 'project-1',
  });

  expect(dataUrlToBlobMock).toHaveBeenCalledWith('data:image/png;base64,abc');
  expect(prepared.entry).toEqual(
    expect.objectContaining({
      projectId: 'project-1',
      galleryAssetId: 'gallery-1',
      mimeType: 'image/png',
      width: 1440,
      height: 900,
      createdAt: 123,
      size: 5,
    })
  );
  expect(prepared.asset).toEqual(
    expect.objectContaining({
      projectId: 'project-1',
      galleryAssetId: 'gallery-1',
      mimeType: 'image/png',
      width: 1440,
      height: 900,
      createdAt: 123,
      size: 5,
    })
  );
}

async function verifiesFallbackAssetMetadata() {
  dataUrlToBlobMock.mockResolvedValue(new Blob(['fallback']));

  const prepared = await prepareScenarioEditedCaptureAsset({
    dataUrl: 'data:image/png;base64,fallback',
    projectId: 'project-2',
  });

  expect(prepared.entry).toEqual(
    expect.objectContaining({
      projectId: 'project-2',
      galleryAssetId: null,
      mimeType: 'image/png',
    })
  );
  expect(prepared.asset).toEqual(
    expect.objectContaining({
      projectId: 'project-2',
      galleryAssetId: null,
      mimeType: 'image/png',
    })
  );
}

function verifiesEditedImageReferenceUpdate() {
  const block = createGuideImageBlock({
    id: 'image-1',
    assetId: 'asset-old',
    width: 320,
    height: 180,
    editDocumentId: 'document-old',
    galleryAssetId: 'gallery-1',
    source: { kind: 'import', filename: 'original.png' },
  });
  block.contentTransform = { x: 0.2, y: -0.1, scale: 1.4 };
  block.caption = 'Keep caption';
  const original = structuredClone(block);
  const edited = buildScenarioEditedImageBlock(block, 'asset-new', 'document-new');
  expect(edited).toEqual({ ...original, assetId: 'asset-new', editDocumentId: 'document-new' });
  expect(block).toEqual(original);
  expect(edited).not.toBe(block);
}

function runCaptureStepEditsSuite() {
  registerCaptureStepEditsScope();

  it(
    'creates a new immutable scenario asset entry from the editor data url',
    verifiesEditedAssetCreation
  );
  it(
    'falls back to canonical metadata when the edited blob has no mime type or gallery asset',
    verifiesFallbackAssetMetadata
  );
  it(
    'repoints only immutable image references while preserving layout and the previous version',
    verifiesEditedImageReferenceUpdate
  );
}

describe('capture step edits', runCaptureStepEditsSuite);
