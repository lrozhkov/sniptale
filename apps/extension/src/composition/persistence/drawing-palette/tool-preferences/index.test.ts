import { beforeEach, expect, it, vi } from 'vitest';
import { createDefaultDrawingToolDefaults } from '../../../../features/drawing/public';
import { browserStorage } from '../../infrastructure/browser-storage';
import {
  DRAWING_TOOL_PREFERENCES_STORAGE_KEY,
  loadDrawingToolPreferences,
  saveDrawingToolPreferences,
  subscribeToDrawingToolPreferences,
} from './index';

const fallback = createDefaultDrawingToolDefaults();
const customized = {
  ...fallback,
  pencil: { color: '#123456', width: 16 },
  marker: { color: '#abcdef', opacity: 1, width: 44 },
  shape: { color: '#112233', fillColor: '#abcdef80', kind: 'triangle' as const, width: 8 },
  arrow: {
    color: '#445566',
    design: 'freehand' as const,
    dynamicWidth: false,
    width: 24,
  },
  text: {
    backgroundColor: '#fedcba80',
    color: '#010203',
    fontFamily: 'serif' as const,
    fontSize: 36,
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(browserStorage.local, 'get').mockResolvedValue({});
});

it('uses caller defaults without writing when preferences are missing', async () => {
  const write = vi.spyOn(browserStorage.local, 'set');

  await expect(loadDrawingToolPreferences(fallback)).resolves.toEqual(fallback);
  expect(write).not.toHaveBeenCalled();
});

it('restores every tool parameter but has no active-tool field', async () => {
  vi.spyOn(browserStorage.local, 'get').mockResolvedValue({
    [DRAWING_TOOL_PREFERENCES_STORAGE_KEY]: { schemaVersion: 1, defaults: customized },
  });

  const restored = await loadDrawingToolPreferences(fallback);
  expect(restored).toEqual(customized);
  expect(restored).not.toHaveProperty('activeTool');
});

it('normalizes the removed parallelogram creation preference without losing other settings', async () => {
  vi.spyOn(browserStorage.local, 'get').mockResolvedValue({
    [DRAWING_TOOL_PREFERENCES_STORAGE_KEY]: {
      schemaVersion: 1,
      defaults: { ...customized, shape: { ...customized.shape, kind: 'parallelogram' } },
    },
  });

  await expect(loadDrawingToolPreferences(fallback)).resolves.toMatchObject({
    pencil: customized.pencil,
    shape: { ...customized.shape, kind: 'rectangle' },
  });
});

it('writes a validated versioned snapshot through the local persistence owner', async () => {
  const write = vi.spyOn(browserStorage.local, 'set').mockResolvedValue(undefined);

  await expect(saveDrawingToolPreferences(customized, fallback)).resolves.toBe('applied');
  expect(write).toHaveBeenCalledWith(
    {
      [DRAWING_TOOL_PREFERENCES_STORAGE_KEY]: {
        schemaVersion: 1,
        defaults: customized,
      },
    },
    expect.any(Object)
  );
});

it('rejects malformed or newer stored state instead of blindly overwriting it', async () => {
  vi.spyOn(browserStorage.local, 'get').mockResolvedValue({
    [DRAWING_TOOL_PREFERENCES_STORAGE_KEY]: { schemaVersion: 99, defaults: customized },
  });
  const write = vi.spyOn(browserStorage.local, 'set');

  await expect(loadDrawingToolPreferences(fallback)).resolves.toEqual(fallback);
  await expect(saveDrawingToolPreferences(customized, fallback)).resolves.toBe('rejected');
  expect(write).not.toHaveBeenCalled();
});

it('rebases disjoint stale-context patches onto the latest authoritative preferences', async () => {
  let stored: unknown = { schemaVersion: 1, defaults: customized };
  vi.spyOn(browserStorage.local, 'get').mockImplementation(async () => ({
    [DRAWING_TOOL_PREFERENCES_STORAGE_KEY]: stored,
  }));
  vi.spyOn(browserStorage.local, 'set').mockImplementation(async (record) => {
    stored = record[DRAWING_TOOL_PREFERENCES_STORAGE_KEY];
  });
  const first = saveDrawingToolPreferences(
    { pencil: { ...customized.pencil, width: 8 } },
    customized
  );
  const second = saveDrawingToolPreferences(
    { marker: { ...customized.marker, opacity: 0.6 } },
    customized
  );

  await expect(Promise.all([first, second])).resolves.toEqual(['applied', 'applied']);
  expect(stored).toMatchObject({
    defaults: { pencil: { width: 8 }, marker: { opacity: 0.6 } },
  });
});

it('recovers the mutation queue after a storage write failure', async () => {
  const write = vi
    .spyOn(browserStorage.local, 'set')
    .mockRejectedValueOnce(new Error('storage failed'))
    .mockResolvedValue(undefined);

  await expect(saveDrawingToolPreferences(customized, fallback)).rejects.toThrow('storage failed');
  await expect(saveDrawingToolPreferences(customized, fallback)).resolves.toBe('applied');
  expect(write).toHaveBeenCalledTimes(2);
});

it('observes only valid local changes for the drawing preference key', () => {
  const unsubscribe = vi.fn();
  vi.spyOn(browserStorage, 'canObserveChanges').mockReturnValue(true);
  const subscribe = vi.spyOn(browserStorage, 'subscribeToChanges').mockReturnValue(unsubscribe);
  const listener = vi.fn();
  const stop = subscribeToDrawingToolPreferences(fallback, listener);
  const storageListener = subscribe.mock.calls[0]?.[0];

  storageListener?.({ unrelated: { newValue: true } }, 'local');
  storageListener?.(
    {
      [DRAWING_TOOL_PREFERENCES_STORAGE_KEY]: {
        newValue: { schemaVersion: 1, defaults: customized },
      },
    },
    'sync'
  );
  storageListener?.(
    {
      [DRAWING_TOOL_PREFERENCES_STORAGE_KEY]: {
        newValue: { schemaVersion: 99, defaults: customized },
      },
    },
    'local'
  );
  storageListener?.(
    {
      [DRAWING_TOOL_PREFERENCES_STORAGE_KEY]: {
        newValue: { schemaVersion: 1, defaults: { ...customized, text: null } },
      },
    },
    'local'
  );
  storageListener?.(
    {
      [DRAWING_TOOL_PREFERENCES_STORAGE_KEY]: {
        newValue: { schemaVersion: 1, defaults: customized },
      },
    },
    'local'
  );
  storageListener?.({ [DRAWING_TOOL_PREFERENCES_STORAGE_KEY]: { newValue: undefined } }, 'local');

  expect(listener).toHaveBeenCalledTimes(2);
  expect(listener).toHaveBeenNthCalledWith(1, customized);
  expect(listener).toHaveBeenNthCalledWith(2, fallback);
  stop();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
