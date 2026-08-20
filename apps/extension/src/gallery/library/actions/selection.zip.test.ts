// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createController, createMediaItem, runBusyAction } from './test-support/index';
import { createSelectionZipAction } from './selection';

const mocks = vi.hoisted(() => ({
  abort: vi.fn(),
  addBlob: vi.fn(),
  close: vi.fn(),
  createDirectFileSink: vi.fn(),
  getMediaAssetBlob: vi.fn(),
}));

vi.mock('../../../composition/archive-transfer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/archive-transfer')>()),
  createArchiveWriter: () => ({
    abort: mocks.abort,
    addBlob: mocks.addBlob,
    addText: vi.fn(),
    close: mocks.close,
  }),
  createDirectFileSink: mocks.createDirectFileSink,
}));

vi.mock(
  '../../../composition/persistence/media-library/index.library.ts',
  async (importOriginal) => ({
    ...(await importOriginal()),
    getMediaAssetBlob: mocks.getMediaAssetBlob,
  })
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.abort.mockResolvedValue(undefined);
  mocks.close.mockResolvedValue(undefined);
  mocks.createDirectFileSink.mockResolvedValue({
    abort: vi.fn(),
    close: vi.fn(),
    writable: new WritableStream(),
  });
  mocks.getMediaAssetBlob.mockResolvedValue(new Blob(['asset']));
});

describe('gallery selection ZIP export', () => {
  it('streams normalized selected media entries into a direct file sink', async () => {
    const { controller } = createController({
      selectedItems: [
        createMediaItem({ entityId: 'asset-1', filename: '../asset.png' }),
        createMediaItem({ entityId: 'asset-2', filename: 'nested/asset.png' }),
        createMediaItem({ entityId: 'asset-3', filename: 'CON' }),
      ],
    });

    await createSelectionZipAction(controller)(runBusyAction);

    expect(mocks.createDirectFileSink).toHaveBeenCalledWith(
      expect.objectContaining({ extension: '.zip', mimeType: 'application/zip' })
    );
    expect(mocks.addBlob.mock.calls.map(([path]) => path)).toEqual([
      'asset.png',
      'asset-2.png',
      'CON_file',
    ]);
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.abort).not.toHaveBeenCalled();
  });

  it('aborts the archive when a selected source is missing', async () => {
    const { controller } = createController({
      selectedItems: [createMediaItem({ entityId: 'asset-1', filename: 'asset.png' })],
    });
    mocks.getMediaAssetBlob.mockResolvedValue(null);

    await expect(createSelectionZipAction(controller)(runBusyAction)).rejects.toThrow();

    expect(mocks.abort).toHaveBeenCalledOnce();
    expect(mocks.close).not.toHaveBeenCalled();
  });

  it('does not read media when the direct sink cannot be acquired', async () => {
    const { controller } = createController({
      selectedItems: [createMediaItem({ entityId: 'asset-1', filename: 'asset.png' })],
    });
    mocks.createDirectFileSink.mockRejectedValue(new DOMException('cancelled', 'AbortError'));

    await expect(createSelectionZipAction(controller)(runBusyAction)).rejects.toThrow('cancelled');
    expect(mocks.getMediaAssetBlob).not.toHaveBeenCalled();
  });

  it('surfaces writer failures and aborts without claiming completion', async () => {
    const { controller } = createController({
      selectedItems: [createMediaItem({ entityId: 'asset-1', filename: 'asset.png' })],
    });
    mocks.addBlob.mockRejectedValue(new Error('disk full'));

    await expect(createSelectionZipAction(controller)(runBusyAction)).rejects.toThrow('disk full');
    expect(mocks.abort).toHaveBeenCalledOnce();
    expect(mocks.close).not.toHaveBeenCalled();
  });
});
