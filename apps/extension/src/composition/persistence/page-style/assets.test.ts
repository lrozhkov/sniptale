import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_STYLE_ASSET_KINDS } from '@sniptale/runtime-contracts/page-style';
import { PAGE_STYLE_LIMITS } from '@sniptale/runtime-contracts/page-style/limits';

const mocks = vi.hoisted(() => ({
  countMock: vi.fn(),
  deleteMock: vi.fn(),
  getMock: vi.fn(),
  initDBMock: vi.fn(),
  openCursorMock: vi.fn(),
  putMock: vi.fn(),
  transactionMock: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  initDB: mocks.initDBMock,
  PAGE_STYLE_ASSETS_STORE: 'page-style-assets',
}));

async function importAssets() {
  vi.resetModules();
  return import('./assets');
}

describe('page style IndexedDB assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(1_500);
    mocks.transactionMock.mockReturnValue({
      done: Promise.resolve(),
      store: {
        count: mocks.countMock,
        openCursor: mocks.openCursorMock,
        put: mocks.putMock,
      },
    });
    mocks.initDBMock.mockResolvedValue({
      delete: mocks.deleteMock,
      get: mocks.getMock,
      transaction: mocks.transactionMock,
    });
    mocks.countMock.mockResolvedValue(0);
    mocks.openCursorMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  registerPageStyleAssetStorageTests();
  registerPageStyleAssetLookupTests();
});

function registerPageStyleAssetStorageTests() {
  registerPageStyleAssetSaveTests();
  registerPageStyleAssetBoundaryTests();
  registerPageStyleAssetMetadataDefaultTests();
}

function registerPageStyleAssetSaveTests() {
  it('saves image binaries and metadata in the page-style asset store', async () => {
    const assets = await importAssets();
    const blob = new Blob(['image-bytes'], { type: 'image/png' });

    const entry = await assets.savePageStyleAsset({
      blob,
      filename: 'replacement.png',
      height: 20,
      id: 'asset-1',
      kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
      mimeType: 'image/png',
      width: 10,
    });

    expect(entry).toEqual({
      blob,
      createdAt: 1_500,
      filename: 'replacement.png',
      height: 20,
      id: 'asset-1',
      kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
      mimeType: 'image/png',
      size: blob.size,
      updatedAt: 1_500,
      width: 10,
    });
    expect(mocks.transactionMock).toHaveBeenCalledWith('page-style-assets', 'readwrite');
    expect(mocks.putMock).toHaveBeenCalledWith(entry);
  });
}

function registerPageStyleAssetBoundaryTests() {
  registerPageStyleAssetInputBoundaryTests();
  registerPageStyleAssetBudgetBoundaryTests();
}

function registerPageStyleAssetInputBoundaryTests() {
  it('rejects unsupported or oversized image assets before writing', async () => {
    const assets = await importAssets();

    await expect(
      assets.savePageStyleAsset({
        blob: new Blob(['<svg></svg>'], { type: 'image/svg+xml' }),
        filename: 'vector.svg',
        kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
        mimeType: 'image/svg+xml',
      })
    ).rejects.toThrow('Page style asset exceeds storage limits.');

    await expect(
      assets.savePageStyleAsset({
        blob: new Blob(['fake-png'], { type: 'image/svg+xml' }),
        filename: 'mismatch.png',
        kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
        mimeType: 'image/png',
      })
    ).rejects.toThrow('Page style asset exceeds storage limits.');

    await expect(
      assets.savePageStyleAsset({
        blob: new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }),
        filename: 'large.png',
        kind: PAGE_STYLE_ASSET_KINDS.IMAGE_REPLACEMENT,
        mimeType: 'image/png',
      })
    ).rejects.toThrow('Page style asset exceeds storage limits.');
    expect(mocks.putMock).not.toHaveBeenCalled();
  });
}

function registerPageStyleAssetBudgetBoundaryTests() {
  it('rejects assets that exceed the page-style store budget before writing', async () => {
    const assets = await importAssets();
    mocks.countMock.mockResolvedValue(1);
    mocks.openCursorMock.mockResolvedValue(
      createCursorChain([{ id: 'existing', size: 50 * 1024 * 1024 }])
    );

    await expect(
      assets.savePageStyleAsset({
        blob: new Blob(['next'], { type: 'image/png' }),
        filename: 'next.png',
        kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
        mimeType: 'image/png',
      })
    ).rejects.toThrow('Page style asset storage budget exceeded.');
    expect(mocks.putMock).not.toHaveBeenCalled();
  });

  it('rejects over-count or corrupt existing asset stores before writing', async () => {
    const assets = await importAssets();
    mocks.countMock.mockResolvedValue(PAGE_STYLE_LIMITS.maxAssets + 1);

    await expect(
      assets.savePageStyleAsset({
        blob: new Blob(['next'], { type: 'image/png' }),
        filename: 'next.png',
        kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
        mimeType: 'image/png',
      })
    ).rejects.toThrow('Page style asset storage budget exceeded.');
    expect(mocks.openCursorMock).not.toHaveBeenCalled();
    expect(mocks.putMock).not.toHaveBeenCalled();

    mocks.countMock.mockResolvedValue(1);
    mocks.openCursorMock.mockResolvedValue(createCursorChain([{ id: 'broken', size: 'bad' }]));

    await expect(
      assets.savePageStyleAsset({
        blob: new Blob(['next'], { type: 'image/png' }),
        filename: 'next.png',
        kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
        mimeType: 'image/png',
      })
    ).rejects.toThrow('Page style asset storage budget exceeded.');
    expect(mocks.putMock).not.toHaveBeenCalled();
  });
}

function createCursorChain(values: unknown[]) {
  const firstValue = values[0];
  if (firstValue === undefined) {
    throw new Error('Expected at least one cursor value');
  }
  let cursorIndex = 0;

  const createCursor = (value: unknown) => ({
    continue: vi.fn().mockImplementation(async () => {
      cursorIndex += 1;
      const nextValue = values[cursorIndex];
      return nextValue === undefined ? null : createCursor(nextValue);
    }),
    value,
  });

  return createCursor(firstValue);
}

function registerPageStyleAssetMetadataDefaultTests() {
  it('generates ids and default dimensions when optional metadata is absent', async () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'generated-asset') });
    const assets = await importAssets();
    const blob = new Blob(['background'], { type: 'image/png' });

    await expect(
      assets.savePageStyleAsset({
        blob,
        filename: 'background.png',
        kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
        mimeType: 'image/png',
      })
    ).resolves.toEqual(
      expect.objectContaining({
        height: null,
        id: 'generated-asset',
        width: null,
      })
    );
  });
}

function registerPageStyleAssetLookupTests() {
  it('looks up and deletes assets by id', async () => {
    const assets = await importAssets();
    const entry = {
      blob: new Blob(['asset']),
      id: 'asset-1',
    };
    mocks.getMock.mockResolvedValue(entry);

    await expect(assets.getPageStyleAsset('asset-1')).resolves.toBe(entry);
    expect(mocks.getMock).toHaveBeenCalledWith('page-style-assets', 'asset-1');

    await assets.deletePageStyleAsset('asset-1');
    expect(mocks.deleteMock).toHaveBeenCalledWith('page-style-assets', 'asset-1');
  });
}
