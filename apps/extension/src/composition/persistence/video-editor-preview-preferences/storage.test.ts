import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  installPersistenceLockManagerForTests,
  isActivePersistenceMutationPermit,
  runWithPersistentDataErasureBarrier,
  type PersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';

beforeEach(() => {
  vi.stubGlobal('chrome', undefined);
  vi.stubGlobal('navigator', {});
  installPersistenceLockManagerForTests(null);
});
afterEach(() => {
  installPersistenceLockManagerForTests(null);
  vi.unstubAllGlobals();
});

import {
  VIDEO_EDITOR_PREVIEW_PREFERENCES_STORAGE_KEY,
  createVideoEditorPreviewPreferencesStorage,
} from './storage';

const firstPreferences = {
  renderer: 'legacy',
  showFrameRate: true,
  frameRate: '15',
  mode: 'cache',
  rasterPreset: '1440p',
  zoom: '75%',
} as const;
const secondPreferences = {
  renderer: 'gpu',
  showFrameRate: false,
  frameRate: 'project',
  mode: 'live',
  rasterPreset: '720p',
  zoom: 'fit',
} as const;

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
    preferences: {
      renderer: 'gpu',
      showFrameRate: false,
      frameRate: 'project',
      mode: 'cache',
      rasterPreset: '720p',
      zoom: '75%',
    },
  });
  expect(area.set).not.toHaveBeenCalled();
});

it('admits the captured renderer snapshot under the existing mutation permit', async () => {
  const set = vi.fn(async (_items: Record<string, unknown>, permit?: PersistenceMutationPermit) => {
    expect(isActivePersistenceMutationPermit(permit)).toBe(true);
  });
  await createVideoEditorPreviewPreferencesStorage({ get: vi.fn(), set }).save(firstPreferences);
  expect(set).toHaveBeenCalledOnce();
});

it('serializes writes and preserves the requested order after a failure', async () => {
  const releaseFirst = Promise.withResolvers<void>();
  const enteredFirst = Promise.withResolvers<void>();
  const area = {
    get: vi.fn(),
    set: vi
      .fn()
      .mockImplementationOnce(() => {
        enteredFirst.resolve();
        return releaseFirst.promise.then(() => Promise.reject(new Error('quota')));
      })
      .mockResolvedValueOnce(undefined),
  };
  const storage = createVideoEditorPreviewPreferencesStorage(area);

  const first = storage.save(firstPreferences);
  const second = storage.save(secondPreferences);
  await enteredFirst.promise;
  expect(area.set).toHaveBeenCalledTimes(1);

  releaseFirst.resolve();
  await expect(first).rejects.toThrow('quota');
  await expect(second).resolves.toBeUndefined();
  expect(area.set.mock.calls.map(([items]) => items)).toEqual([
    { [VIDEO_EDITOR_PREVIEW_PREFERENCES_STORAGE_KEY]: firstPreferences },
    { [VIDEO_EDITOR_PREVIEW_PREFERENCES_STORAGE_KEY]: secondPreferences },
  ]);
});

it('drains admitted renderer saves before erasure and refuses saves while erasure holds', async () => {
  const write = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  const erasing = Promise.withResolvers<void>();
  const releaseErasure = Promise.withResolvers<void>();
  let stored: unknown;
  const events: string[] = [];
  const set = vi.fn(async (items: Record<string, unknown>, permit?: PersistenceMutationPermit) => {
    expect(isActivePersistenceMutationPermit(permit)).toBe(true);
    if (events.length === 0) {
      events.push('first-start');
      entered.resolve();
      await write.promise;
      events.push('first-end');
    } else events.push('next');
    stored = items[VIDEO_EDITOR_PREVIEW_PREFERENCES_STORAGE_KEY];
  });
  const storage = createVideoEditorPreviewPreferencesStorage({ get: vi.fn(), set });
  const first = storage.save(firstPreferences);
  const second = storage.save(secondPreferences);
  await entered.promise;
  const erase = runWithPersistentDataErasureBarrier(async () => {
    expect(stored).toEqual(secondPreferences);
    events.push('erase');
    stored = undefined;
    erasing.resolve();
    await releaseErasure.promise;
  });
  write.resolve();
  await Promise.all([first, second, erasing.promise]);
  try {
    await expect(storage.save(firstPreferences)).rejects.toThrow('refused during erasure');
  } finally {
    releaseErasure.resolve();
    await erase;
  }
  expect(events).toEqual(['first-start', 'first-end', 'next', 'erase']);
  expect(stored).toBeUndefined();
  await storage.save(firstPreferences);
  expect(stored).toEqual(firstPreferences);
});

it('rejects invalid values before a durable write', async () => {
  const area = { get: vi.fn(), set: vi.fn() };
  const storage = createVideoEditorPreviewPreferencesStorage(area);

  await expect(
    Reflect.apply(storage.save, storage, [
      {
        showFrameRate: false,
        frameRate: 'project',
        mode: 'cache',
        rasterPreset: '4k',
        zoom: 'fit',
      },
    ])
  ).rejects.toThrow('Invalid video editor preview preferences');
  expect(area.set).not.toHaveBeenCalled();
});
