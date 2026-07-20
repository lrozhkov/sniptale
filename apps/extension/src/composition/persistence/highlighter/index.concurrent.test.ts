import { beforeEach, expect, it, vi } from 'vitest';
import { createPreset, createSettings } from './test-helpers';

const { syncGetMock, syncSetMock, translateMock } = vi.hoisted(() => ({
  syncGetMock: vi.fn(),
  syncSetMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    sync: {
      get: syncGetMock,
      set: syncSetMock,
    },
  },
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

function createDeferred() {
  let resolve: (() => void) | null = null;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve: () => resolve?.(),
  };
}

async function loadHighlighterStorage() {
  return import('./index');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

it('serializes concurrent preset mutations to avoid blind overwrites', async () => {
  const firstWrite = createDeferred();
  syncGetMock.mockResolvedValue({
    sniptale_highlighter_settings: createSettings(),
  });
  syncSetMock.mockImplementationOnce(() => firstWrite.promise).mockResolvedValueOnce(undefined);

  const { addBorderPreset, updateBorderPreset } = await loadHighlighterStorage();

  const addPresetPromise = addBorderPreset(createPreset('preset-2', { order: 1 }));
  const updatePresetPromise = updateBorderPreset(createPreset('preset-1', { name: 'Updated' }));

  await vi.waitFor(() => {
    expect(syncGetMock).toHaveBeenCalledTimes(1);
    expect(syncSetMock).toHaveBeenCalledTimes(1);
  });

  firstWrite.resolve();
  await Promise.all([addPresetPromise, updatePresetPromise]);

  expect(syncSetMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(syncSetMock.mock.lastCall?.[0]?.sniptale_highlighter_settings.borderPresets).toEqual(
    expect.arrayContaining([
      createPreset('preset-1', { name: 'Updated' }),
      createPreset('preset-2', { order: 1 }),
    ])
  );
});
