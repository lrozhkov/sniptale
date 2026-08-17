import { beforeEach, expect, it, vi } from 'vitest';

import type { HighlighterSettings } from '../../../features/highlighter/contracts';
import { createDefaultHighlighterSettings } from '../../../features/highlighter/style/defaults';

const storageState = vi.hoisted(() => ({ value: undefined as unknown }));
const { syncGetMock, syncSetMock } = vi.hoisted(() => ({
  syncGetMock: vi.fn(async () => ({ sniptale_highlighter_settings: storageState.value })),
  syncSetMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: { sync: { get: syncGetMock, set: syncSetMock } },
}));

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

beforeEach(() => {
  storageState.value = createDefaultHighlighterSettings();
  vi.clearAllMocks();
  vi.resetModules();
});

it('serializes concurrent mutations and re-reads the latest persisted state', async () => {
  const firstWrite = createDeferred();
  syncSetMock
    .mockImplementationOnce(async (payload: Record<string, unknown>) => {
      await firstWrite.promise;
      storageState.value = payload['sniptale_highlighter_settings'];
    })
    .mockImplementationOnce(async (payload: Record<string, unknown>) => {
      storageState.value = payload['sniptale_highlighter_settings'];
    });
  const module = await import('./index');
  const source = createDefaultHighlighterSettings().borderPresets[0]!;
  const {
    basedOnRevision: _basedOnRevision,
    customized: _customized,
    systemPresetKey: _systemPresetKey,
    ...userSource
  } = source;
  const userPreset = {
    ...userSource,
    id: 'user-1',
    name: 'User preset',
    origin: 'user' as const,
  };

  const add = module.addBorderPreset(userPreset);
  const disable = module.setBorderPresetEnabled('system-default', false);
  await vi.waitFor(() => expect(syncSetMock).toHaveBeenCalledOnce());
  expect(syncGetMock).toHaveBeenCalledTimes(2);

  firstWrite.resolve();
  await Promise.all([add, disable]);

  expect(syncGetMock).toHaveBeenCalledTimes(3);
  expect(syncSetMock).toHaveBeenCalledTimes(2);
  const stored = storageState.value as HighlighterSettings;
  expect(stored.borderPresets.some((preset) => preset.id === 'user-1')).toBe(true);
  expect(stored.borderPresets.find((preset) => preset.id === 'system-default')?.enabled).toBe(
    false
  );
});
