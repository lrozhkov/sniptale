import { beforeEach, expect, it, vi } from 'vitest';

const { browserStorageLocalGetMock, browserStorageLocalSetMock } = vi.hoisted(() => ({
  browserStorageLocalGetMock: vi.fn(),
  browserStorageLocalSetMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    local: {
      get: browserStorageLocalGetMock,
      set: browserStorageLocalSetMock,
    },
  },
}));

import {
  DEFAULT_EDITOR_EXPORT_SETTINGS,
  loadEditorExportSettings,
  patchEditorExportSettings,
} from './index';

async function flushEditorExportStorageMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  browserStorageLocalGetMock.mockResolvedValue({});
  browserStorageLocalSetMock.mockResolvedValue(undefined);
});

it('loads defaults and sanitizes malformed storage payloads', async () => {
  browserStorageLocalGetMock
    .mockResolvedValueOnce({
      sniptale_editor_export_settings: { imageFormat: 'webp', imageQuality: 82 },
    })
    .mockResolvedValueOnce({
      sniptale_editor_export_settings: { imageFormat: 'gif', imageQuality: 'high' },
    })
    .mockResolvedValueOnce({
      sniptale_editor_export_settings: 'bad',
    });

  await expect(loadEditorExportSettings()).resolves.toEqual({
    imageFormat: 'webp',
    imageQuality: 82,
  });
  await expect(loadEditorExportSettings()).resolves.toEqual(DEFAULT_EDITOR_EXPORT_SETTINGS);
  await expect(loadEditorExportSettings()).resolves.toEqual(DEFAULT_EDITOR_EXPORT_SETTINGS);
});

it('persists patched editor export settings and rejects failed writes', async () => {
  browserStorageLocalGetMock.mockResolvedValue({
    sniptale_editor_export_settings: { imageFormat: 'png', imageQuality: 100 },
  });

  await expect(patchEditorExportSettings({ imageFormat: 'jpeg' })).resolves.toEqual({
    imageFormat: 'jpeg',
    imageQuality: 100,
  });
  expect(browserStorageLocalSetMock).toHaveBeenCalledWith({
    sniptale_editor_export_settings: { imageFormat: 'jpeg', imageQuality: 100 },
  });

  browserStorageLocalSetMock.mockRejectedValueOnce(new Error('write failed'));

  await expect(patchEditorExportSettings({ imageQuality: 77 })).rejects.toThrow('write failed');
});

it('serializes writes so older editor export updates cannot finish after newer writes', async () => {
  let storedSettings = { imageFormat: 'png' as const, imageQuality: 100 };
  const releaseWrites: Array<() => void> = [];
  browserStorageLocalGetMock.mockImplementation(async () => ({
    sniptale_editor_export_settings: storedSettings,
  }));
  browserStorageLocalSetMock.mockImplementation(
    (items: { sniptale_editor_export_settings: typeof storedSettings }) =>
      new Promise<void>((resolve) => {
        releaseWrites.push(() => {
          storedSettings = items.sniptale_editor_export_settings;
          resolve();
        });
      })
  );

  const first = patchEditorExportSettings({ imageFormat: 'jpeg' });
  const second = patchEditorExportSettings({ imageQuality: 65 });
  await flushEditorExportStorageMicrotasks();

  expect(browserStorageLocalSetMock).toHaveBeenCalledTimes(1);
  releaseWrites.shift()?.();
  await first;
  await flushEditorExportStorageMicrotasks();

  expect(browserStorageLocalSetMock).toHaveBeenCalledTimes(2);
  releaseWrites.shift()?.();
  await expect(second).resolves.toEqual({ imageFormat: 'jpeg', imageQuality: 65 });
  expect(storedSettings).toEqual({ imageFormat: 'jpeg', imageQuality: 65 });
});
