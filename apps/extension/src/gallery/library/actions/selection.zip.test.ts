// @vitest-environment jsdom

import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createController, createMediaItem, runBusyAction } from './test-support/index';
import { createSelectionZipAction } from './helpers';

const nativeCreateElement = document.createElement.bind(document);

const { getMediaAssetBlobMock } = vi.hoisted(() => ({
  getMediaAssetBlobMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal()),
    getMediaAssetBlob: getMediaAssetBlobMock,
  })
);

beforeEach(() => {
  vi.restoreAllMocks();
  getMediaAssetBlobMock.mockReset();
});

describe('gallery selection ZIP export', () => {
  it('downloads selected media items as a zip', async () => {
    const { controller } = createController({
      selectedItems: [createMediaItem({ entityId: 'asset-1', filename: 'asset.png' })],
    });
    getMediaAssetBlobMock.mockResolvedValue(new Blob(['asset']));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    stubAnchorClicks();

    await createSelectionZipAction(controller)(runBusyAction);

    expect(getMediaAssetBlobMock).toHaveBeenCalledWith('asset-1');
  });

  it('normalizes selected media filenames before adding ZIP entries', async () => {
    const { controller } = createController({
      selectedItems: [
        createMediaItem({ entityId: 'asset-1', filename: '../asset.png' }),
        createMediaItem({ entityId: 'asset-2', filename: 'nested/asset.png' }),
        createMediaItem({ entityId: 'asset-3', filename: 'CON' }),
      ],
    });
    let archiveBlob: Blob | null = null;
    getMediaAssetBlobMock.mockResolvedValue(new Blob(['asset']));
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      archiveBlob = blob as Blob;
      return 'blob:zip';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    stubAnchorClicks();

    await createSelectionZipAction(controller)(runBusyAction);

    if (!archiveBlob) {
      throw new Error('Expected selection archive blob.');
    }
    const zip = await JSZip.loadAsync(archiveBlob);
    expect(Object.keys(zip.files).sort()).toEqual(['CON_file', 'asset-2.png', 'asset.png']);
  });
});

describe('gallery selection ZIP source boundaries', () => {
  it('rejects oversized entries before download', async () => {
    const { controller } = createController({
      selectedItems: [createMediaItem({ entityId: 'asset-1', filename: 'huge.png' })],
    });
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');
    getMediaAssetBlobMock.mockResolvedValue(createBlobWithSize(251 * 1024 * 1024));
    stubAnchorClicks();

    await expect(createSelectionZipAction(controller)(runBusyAction)).rejects.toThrow(
      'Selected media item is too large for ZIP export'
    );
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  it('rejects total source overflow before download', async () => {
    const { controller } = createController({
      selectedItems: [
        createMediaItem({ entityId: 'asset-1', filename: 'first.png' }),
        createMediaItem({ entityId: 'asset-2', filename: 'second.png' }),
        createMediaItem({ entityId: 'asset-3', filename: 'third.png' }),
      ],
    });
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');
    getMediaAssetBlobMock.mockImplementation(async (id: string) =>
      id === 'asset-3'
        ? createBlobWithSize(13 * 1024 * 1024)
        : createBlobWithSize(250 * 1024 * 1024)
    );
    stubAnchorClicks();

    await expect(createSelectionZipAction(controller)(runBusyAction)).rejects.toThrow(
      'Selected media ZIP export exceeds total byte budget'
    );
    expect(getMediaAssetBlobMock).toHaveBeenCalledTimes(3);
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });
});

describe('gallery selection ZIP package boundaries', () => {
  it('rejects too many entries before reading blobs', async () => {
    const { controller } = createController({
      selectedItems: Array.from({ length: 501 }, (_value, index) =>
        createMediaItem({ entityId: `asset-${index}`, filename: `asset-${index}.png` })
      ),
    });

    await expect(createSelectionZipAction(controller)(runBusyAction)).rejects.toThrow(
      'Selected media ZIP export has too many entries'
    );
    expect(getMediaAssetBlobMock).not.toHaveBeenCalled();
  });

  it('rejects generated ZIP overflow before download', async () => {
    const { controller } = createController({
      selectedItems: [createMediaItem({ entityId: 'asset-1', filename: 'asset.png' })],
    });
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');
    const generateAsyncSpy = vi
      .spyOn(JSZip.prototype, 'generateAsync')
      .mockImplementationOnce(async () => createBlobWithSize(513 * 1024 * 1024));
    getMediaAssetBlobMock.mockResolvedValue(new Blob(['asset']));
    stubAnchorClicks();

    await expect(createSelectionZipAction(controller)(runBusyAction)).rejects.toThrow(
      'Selected media ZIP export exceeds generated byte budget'
    );
    expect(generateAsyncSpy).toHaveBeenCalled();
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });
});

function stubAnchorClicks() {
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    const element = nativeCreateElement(tagName);
    if (tagName === 'a') {
      (element as HTMLAnchorElement).click = vi.fn();
    }
    return element;
  });
}

function createBlobWithSize(size: number): Blob {
  const blob = new Blob(['x']);
  Object.defineProperty(blob, 'size', { value: size });
  return blob;
}
