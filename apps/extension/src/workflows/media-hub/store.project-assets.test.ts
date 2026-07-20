import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeMocks = vi.hoisted(() => ({
  publishMediaHubLibraryChanged: vi.fn(),
  saveProjectAsset: vi.fn(),
  withMediaHubWriteGuard: vi.fn(),
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

describe('media-hub project asset storage boundary rejection', () => {
  it('rejects unsupported project asset MIME types before storage writes', async () => {
    const { saveProjectAssetSafely } = await import('./store');

    await expect(
      saveProjectAssetSafely(
        'asset-1',
        new Blob(['svg'], { type: 'image/svg+xml' }),
        'image/svg+xml',
        'asset.svg'
      )
    ).rejects.toThrow('Unsupported project asset MIME type.');

    expectNoProjectAssetWrite();
  });
});

describe('media-hub project asset storage boundary budgets', () => {
  it('rejects oversized project asset blobs before storage writes', async () => {
    const { saveProjectAssetSafely } = await import('./store');
    const blob = new Blob(['video'], { type: 'video/webm' });

    Object.defineProperty(blob, 'size', {
      configurable: true,
      value: 512 * 1024 * 1024 + 1,
    });

    await expect(
      saveProjectAssetSafely('asset-1', blob, 'video/webm', 'clip.webm')
    ).rejects.toThrow('Project asset exceeds storage size limit.');

    expectNoProjectAssetWrite();
  });
});

describe('media-hub project asset storage boundary success', () => {
  it('allows supported parameterized project asset MIME types', async () => {
    const { saveProjectAssetSafely } = await import('./store');
    const blob = new Blob(['audio'], { type: 'audio/webm;codecs=opus' });

    await saveProjectAssetSafely('asset-1', blob, 'audio/webm;codecs=opus', 'voice.webm');

    expect(storeMocks.withMediaHubWriteGuard).toHaveBeenCalledWith(
      'shared.mediaHub.saveProjectAssetAction',
      expect.any(Function)
    );
    expect(storeMocks.saveProjectAsset).toHaveBeenCalledWith(
      'asset-1',
      blob,
      'audio/webm;codecs=opus',
      'voice.webm'
    );
    expect(storeMocks.publishMediaHubLibraryChanged).toHaveBeenCalledWith('create', [
      'project-asset:asset-1',
    ]);
  });
});

function expectNoProjectAssetWrite() {
  expect(storeMocks.withMediaHubWriteGuard).not.toHaveBeenCalled();
  expect(storeMocks.saveProjectAsset).not.toHaveBeenCalled();
  expect(storeMocks.publishMediaHubLibraryChanged).not.toHaveBeenCalled();
}
