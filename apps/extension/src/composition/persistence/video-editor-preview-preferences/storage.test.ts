import { expect, it, vi } from 'vitest';

import {
  VIDEO_EDITOR_PREVIEW_PREFERENCES_STORAGE_KEY,
  createVideoEditorPreviewPreferencesStorage,
} from './storage';

const firstPreferences = { mode: 'cache', rasterPreset: '1440p', zoom: '75%' } as const;
const secondPreferences = { mode: 'live', rasterPreset: '720p', zoom: 'fit' } as const;

it('loads validated fields without write-on-read repair', async () => {
  const area = {
    get: vi.fn().mockResolvedValue({
      [VIDEO_EDITOR_PREVIEW_PREFERENCES_STORAGE_KEY]: {
        mode: 'cache',
        rasterPreset: 'invalid',
        zoom: '75%',
      },
    }),
    set: vi.fn(),
  };
  const storage = createVideoEditorPreviewPreferencesStorage(area);

  await expect(storage.load()).resolves.toEqual({
    invalidFieldCount: 1,
    preferences: { mode: 'cache', rasterPreset: '720p', zoom: '75%' },
  });
  expect(area.set).not.toHaveBeenCalled();
});

it('serializes writes and preserves the requested order after a failure', async () => {
  const releaseFirst = Promise.withResolvers<void>();
  const area = {
    get: vi.fn(),
    set: vi
      .fn()
      .mockImplementationOnce(() =>
        releaseFirst.promise.then(() => Promise.reject(new Error('quota')))
      )
      .mockResolvedValueOnce(undefined),
  };
  const storage = createVideoEditorPreviewPreferencesStorage(area);

  const first = storage.save(firstPreferences);
  const second = storage.save(secondPreferences);
  await Promise.resolve();
  expect(area.set).toHaveBeenCalledTimes(1);

  releaseFirst.resolve();
  await expect(first).rejects.toThrow('quota');
  await expect(second).resolves.toBeUndefined();
  expect(area.set.mock.calls).toEqual([
    [{ [VIDEO_EDITOR_PREVIEW_PREFERENCES_STORAGE_KEY]: firstPreferences }],
    [{ [VIDEO_EDITOR_PREVIEW_PREFERENCES_STORAGE_KEY]: secondPreferences }],
  ]);
});

it('rejects invalid values before a durable write', async () => {
  const area = { get: vi.fn(), set: vi.fn() };
  const storage = createVideoEditorPreviewPreferencesStorage(area);

  await expect(
    Reflect.apply(storage.save, storage, [{ mode: 'cache', rasterPreset: '4k', zoom: 'fit' }])
  ).rejects.toThrow('Invalid video editor preview preferences');
  expect(area.set).not.toHaveBeenCalled();
});
