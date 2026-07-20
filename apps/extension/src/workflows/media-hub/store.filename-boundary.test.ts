import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeMocks = vi.hoisted(() => ({
  publishMediaHubLibraryChanged: vi.fn(),
  saveProjectAsset: vi.fn(),
  saveScreenshotMediaAsset: vi.fn(),
  updateMediaLibraryEntry: vi.fn(),
  withMediaHubWriteGuard: vi.fn(),
}));

vi.mock('../../composition/persistence/media-library/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/media-library/index')>()),
  saveScreenshotMediaAsset: storeMocks.saveScreenshotMediaAsset,
  updateMediaLibraryEntry: storeMocks.updateMediaLibraryEntry,
}));

vi.mock('../../composition/persistence/projects/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../composition/persistence/projects/index')>()),
  saveProjectAsset: storeMocks.saveProjectAsset,
}));

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../features/media-hub/storage-errors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/media-hub/storage-errors')>()),
  withMediaHubWriteGuard: storeMocks.withMediaHubWriteGuard,
}));

vi.mock('../../features/media-hub/events', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/media-hub/events')>()),
  publishMediaHubLibraryChanged: storeMocks.publishMediaHubLibraryChanged,
}));

beforeEach(() => {
  vi.clearAllMocks();
  storeMocks.withMediaHubWriteGuard.mockImplementation(
    async (_operation: string, callback: () => Promise<unknown>) => callback()
  );
});

describe('media-hub store filename boundaries', () => {
  it('rejects unsafe media metadata filenames before storage writes', async () => {
    const { updateMediaLibraryEntrySafely } = await import('./store');

    await expect(
      updateMediaLibraryEntrySafely('asset-1', { filename: '../escape.png' })
    ).rejects.toThrow('Unsafe media filename.');

    expect(storeMocks.withMediaHubWriteGuard).not.toHaveBeenCalled();
    expect(storeMocks.updateMediaLibraryEntry).not.toHaveBeenCalled();
    expect(storeMocks.publishMediaHubLibraryChanged).not.toHaveBeenCalled();
  });

  it('rejects unsafe new media filenames before storage writes', async () => {
    const { saveProjectAssetSafely, saveScreenshotMediaAssetSafely } = await import('./store');

    await expect(
      saveScreenshotMediaAssetSafely({
        blob: new Blob(['shot'], { type: 'image/png' }),
        filename: 'nested/shot.png',
      })
    ).rejects.toThrow('Unsafe media filename.');
    await expect(
      saveProjectAssetSafely('asset-1', new Blob(['asset']), 'image/png', 'CON')
    ).rejects.toThrow('Unsafe media filename.');

    expect(storeMocks.withMediaHubWriteGuard).not.toHaveBeenCalled();
    expect(storeMocks.saveProjectAsset).not.toHaveBeenCalled();
    expect(storeMocks.saveScreenshotMediaAsset).not.toHaveBeenCalled();
  });
});
