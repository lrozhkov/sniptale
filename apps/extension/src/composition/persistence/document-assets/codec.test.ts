import { beforeEach, expect, it, vi } from 'vitest';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';

const mocks = vi.hoisted(() => ({
  nextId: 0,
  readAssetFile: vi.fn(),
  writeBlobToAsset: vi.fn(),
  discardPreparedAsset: vi.fn(async () => undefined),
}));

vi.mock('../assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../assets')>()),
  discardPreparedAsset: mocks.discardPreparedAsset,
  readAssetFile: mocks.readAssetFile,
  writeBlobToAsset: mocks.writeBlobToAsset,
}));

vi.mock('../../../platform/media-utils/data-url', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/media-utils/data-url')>()),
  blobToDataUrl: vi.fn(async (blob: Blob) => `data:${blob.type};base64,cmVzdG9yZWQ=`),
}));

import {
  hydratePersistedEditorDocument,
  materializePersistedEditorDocumentForLegacyTransfer,
  preparePersistedEditorDocument,
} from './codec';
import { parsePersistedEditorDocument } from './parser';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nextId = 0;
  mocks.writeBlobToAsset.mockImplementation(async (blob: Blob) => {
    const assetId = `asset-${++mocks.nextId}`;
    return {
      ref: {
        assetId,
        createdAt: 1,
        location: { kind: 'opfs', objectKey: `objects/${assetId}` },
        mimeType: blob.type,
        sha256: null,
        size: blob.size,
      },
    };
  });
});

it('extracts all supported editor raster fields into immutable asset slots', async () => {
  const document = createEditorDocumentFixture();
  document.frame.backgroundImageData = 'data:image/png;base64,Ymc=';
  document.browserFrame = {
    canvasMode: 'resize',
    contentMode: 'push-down',
    faviconDataUrl: 'data:image/png;base64,aWNvbg==',
    title: 'Page',
    url: 'https://example.test',
  };
  document.canvasJson = JSON.stringify({
    objects: [
      { type: 'image', src: 'data:image/png;base64,aW1hZ2U=' },
      { sniptaleBlurSourceData: 'data:image/png;base64,Ymx1cg==', type: 'rect' },
    ],
    version: '7.2.0',
  });

  const prepared = await preparePersistedEditorDocument(document);

  expect(prepared.objects).toHaveLength(5);
  expect(prepared.document.assets.map((asset) => asset.role)).toEqual([
    'source-image',
    'frame-background',
    'browser-favicon',
    'canvas:$.objects[0].src',
    'canvas:$.objects[1].sniptaleBlurSourceData',
  ]);
  expect(JSON.stringify(prepared.document)).not.toMatch(/data:|blob:|base64/i);
  expect(parsePersistedEditorDocument(prepared.document)).toEqual(prepared.document);
});

it('hydrates files through temporary object URLs and revokes every URL exactly once', async () => {
  const prepared = await preparePersistedEditorDocument(createEditorDocumentFixture());
  mocks.readAssetFile.mockResolvedValue(new File(['source'], 'source', { type: 'image/png' }));
  const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:source');
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

  const hydrated = await hydratePersistedEditorDocument({
    document: prepared.document,
    refs: prepared.objects.map(({ ref }) => ref),
  });

  expect(hydrated.document.sourceImageData).toBe('blob:source');
  hydrated.release();
  hydrated.release();
  expect(createObjectUrl).toHaveBeenCalledTimes(1);
  expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
});

it('rejects embedded, remote, undeclared, and duplicate-role persisted asset metadata', async () => {
  const prepared = await preparePersistedEditorDocument(createEditorDocumentFixture());
  expect(
    parsePersistedEditorDocument({
      ...prepared.document,
      canvasJson: JSON.stringify({ objects: [{ src: 'https://attacker.test/pixel.png' }] }),
    })
  ).toBeNull();
  expect(
    parsePersistedEditorDocument({
      ...prepared.document,
      sourceName: 'data:image/png;base64,AA==',
    })
  ).toBeNull();
  expect(
    parsePersistedEditorDocument({
      ...prepared.document,
      assets: [...prepared.document.assets, { ...prepared.document.assets[0]! }],
    })
  ).toBeNull();
});

it('keeps persisted metadata bounded for a realistic editor document above 10 MiB', async () => {
  const document = createEditorDocumentFixture();
  document.sourceImageData = `data:image/png;base64,${'A'.repeat(15 * 1024 * 1024)}`;

  expect(new TextEncoder().encode(JSON.stringify(document)).byteLength).toBeGreaterThan(
    10 * 1024 * 1024
  );

  const prepared = await preparePersistedEditorDocument(document);
  const persistedBytes = new TextEncoder().encode(JSON.stringify(prepared.document)).byteLength;

  expect(prepared.objects[0]?.ref.size).toBeGreaterThan(10 * 1024 * 1024);
  expect(persistedBytes).toBeLessThan(16 * 1024);
  expect(JSON.stringify(prepared.document)).not.toMatch(/data:|blob:|base64/i);
});

it('discards every staged object when a later editor asset write fails', async () => {
  const document = createEditorDocumentFixture();
  document.frame.backgroundImageData = 'data:image/png;base64,Ymc=';
  const failure = new Error('quota exhausted');
  mocks.writeBlobToAsset
    .mockImplementationOnce(async (blob: Blob) => ({
      ref: {
        assetId: 'staged-source',
        createdAt: 1,
        location: { kind: 'opfs', objectKey: 'objects/staged-source' },
        mimeType: blob.type,
        sha256: null,
        size: blob.size,
      },
    }))
    .mockRejectedValueOnce(failure);

  await expect(preparePersistedEditorDocument(document)).rejects.toBe(failure);
  expect(mocks.discardPreparedAsset).toHaveBeenCalledOnce();
  expect(mocks.discardPreparedAsset).toHaveBeenCalledWith('staged-source');
});

it('hydrates every optional asset slot and nested canvas reference', async () => {
  const document = createEditorDocumentFixture();
  document.frame.backgroundImageData = 'data:image/png;base64,Ymc=';
  document.browserFrame = {
    canvasMode: 'resize',
    contentMode: 'push-down',
    faviconDataUrl: 'data:image/png;base64,aWNvbg==',
    title: 'Page',
    url: 'https://example.test',
  };
  document.canvasJson = JSON.stringify({
    objects: [{ src: 'data:image/png;base64,aW1hZ2U=' }],
  });
  const prepared = await preparePersistedEditorDocument(document);
  mocks.readAssetFile.mockImplementation(
    async (_ref, role: string) => new File([role], role, { type: 'image/png' })
  );
  const createObjectUrl = vi
    .spyOn(URL, 'createObjectURL')
    .mockImplementation((file) => `blob:${(file as File).name}`);
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

  const hydrated = await hydratePersistedEditorDocument({
    document: prepared.document,
    refs: prepared.objects.map(({ ref }) => ref),
  });

  expect(hydrated.document.frame.backgroundImageData).toBe('blob:frame-background');
  expect(hydrated.document.browserFrame?.faviconDataUrl).toBe('blob:browser-favicon');
  expect(hydrated.document.canvasJson).toContain('blob:canvas:$.objects[0].src');
  hydrated.release();
  expect(createObjectUrl).toHaveBeenCalledTimes(4);
  expect(revokeObjectUrl).toHaveBeenCalledTimes(4);
});

it('revokes created URLs when hydration discovers a missing ref', async () => {
  const document = createEditorDocumentFixture();
  document.frame.backgroundImageData = 'data:image/png;base64,Ymc=';
  const prepared = await preparePersistedEditorDocument(document);
  mocks.readAssetFile.mockResolvedValue(new File(['source'], 'source', { type: 'image/png' }));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:source');
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

  await expect(
    hydratePersistedEditorDocument({
      document: prepared.document,
      refs: prepared.objects.slice(0, 1).map(({ ref }) => ref),
    })
  ).rejects.toThrow('Editor document asset ref is missing');
  expect(revokeObjectUrl).toHaveBeenCalledWith('blob:source');
});

it('materializes file-backed slots only for the retiring legacy transfer boundary', async () => {
  const document = createEditorDocumentFixture();
  document.frame.backgroundImageData = 'data:image/png;base64,Ymc=';
  document.browserFrame = {
    canvasMode: 'resize',
    contentMode: 'push-down',
    faviconDataUrl: 'data:image/png;base64,aWNvbg==',
    title: 'Page',
    url: 'https://example.test',
  };
  document.canvasJson = JSON.stringify({ src: 'data:image/png;base64,aW1hZ2U=' });
  const prepared = await preparePersistedEditorDocument(document);
  mocks.readAssetFile.mockResolvedValue(new File(['asset'], 'asset', { type: 'image/png' }));

  const materialized = await materializePersistedEditorDocumentForLegacyTransfer({
    document: prepared.document,
    refs: prepared.objects.map(({ ref }) => ref),
  });

  expect(materialized.sourceImageData).toMatch(/^data:image\/png;base64,/);
  expect(materialized.frame.backgroundImageData).toMatch(/^data:image\/png;base64,/);
  expect(materialized.browserFrame?.faviconDataUrl).toMatch(/^data:image\/png;base64,/);
  expect(materialized.canvasJson).not.toContain('sniptale-asset:');
});

it('reports cleanup failures together with the original preparation error', async () => {
  const document = createEditorDocumentFixture();
  document.canvasJson = '{';
  const cleanupFailure = new Error('cleanup failed');
  mocks.discardPreparedAsset.mockRejectedValueOnce(cleanupFailure);

  await expect(preparePersistedEditorDocument(document)).rejects.toMatchObject({
    name: 'AggregateError',
    errors: expect.arrayContaining([cleanupFailure]),
  });
});
