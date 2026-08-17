import { beforeEach, expect, it, vi } from 'vitest';
import { createDefaultHighlighterSettings } from '../../../features/highlighter/style/defaults';

const storageMocks = vi.hoisted(() => {
  const listeners: Array<
    (changes: Record<string, { newValue?: unknown }>, areaName: string) => void
  > = [];

  return {
    canObserveChangesMock: vi.fn(() => true),
    emitChange: (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      listeners.forEach((listener) => listener(changes, areaName));
    },
    getMock: vi.fn(),
    resetListeners: () => {
      listeners.length = 0;
    },
    setMock: vi.fn(),
    subscribeToChangesMock: vi.fn((listener) => {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      };
    }),
  };
});

const translateMock = vi.hoisted(() => vi.fn((key: string) => key));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    canObserveChanges: storageMocks.canObserveChangesMock,
    subscribeToChanges: storageMocks.subscribeToChangesMock,
    sync: {
      get: storageMocks.getMock,
      set: storageMocks.setMock,
    },
  },
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

async function loadHighlighterStorage() {
  return import('./index');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  storageMocks.resetListeners();
  storageMocks.canObserveChangesMock.mockReturnValue(true);
  storageMocks.getMock.mockResolvedValue({
    sniptale_highlighter_settings: createDefaultHighlighterSettings(),
  });
  storageMocks.setMock.mockResolvedValue(undefined);
});

it('subscribes to sync changes, ignores unrelated events, and returns detached snapshots', async () => {
  const module = await loadHighlighterStorage();
  const listener = vi.fn();
  const unsubscribe = module.subscribeToHighlighterSettings(listener);

  storageMocks.emitChange({ sniptale_highlighter_settings: { newValue: {} } }, 'local');
  storageMocks.emitChange({}, 'sync');
  storageMocks.emitChange(
    {
      sniptale_highlighter_settings: {
        newValue: createDefaultHighlighterSettings(),
      },
    },
    'sync'
  );

  const snapshot = module.getLoadedHighlighterSettingsSnapshot();
  snapshot?.borderPresets.splice(0, 1);

  expect(listener).toHaveBeenCalledOnce();
  expect(module.getLoadedHighlighterSettingsSnapshot()?.borderPresets).toHaveLength(15);

  unsubscribe();
  storageMocks.emitChange(
    { sniptale_highlighter_settings: { newValue: createDefaultHighlighterSettings() } },
    'sync'
  );
  expect(listener).toHaveBeenCalledTimes(1);
});

it('returns a noop unsubscribe handler when sync observation is unavailable', async () => {
  storageMocks.canObserveChangesMock.mockReturnValue(false);

  const module = await loadHighlighterStorage();
  const unsubscribe = module.subscribeToHighlighterSettings(vi.fn());

  expect(storageMocks.subscribeToChangesMock).not.toHaveBeenCalled();
  expect(unsubscribe).toBeTypeOf('function');
});

it('updates system enabled state while preserving a valid default and the last-enabled invariant', async () => {
  const module = await loadHighlighterStorage();
  let stored = createDefaultHighlighterSettings();
  stored.borderPresets = stored.borderPresets.map((preset, index) => ({
    ...preset,
    enabled: index < 2,
  }));

  storageMocks.getMock.mockImplementation(async () => ({
    sniptale_highlighter_settings: stored,
  }));
  storageMocks.setMock.mockImplementation(async (payload) => {
    stored = payload.sniptale_highlighter_settings;
  });

  await module.setBorderPresetEnabled('system-default', false);
  await module.setBorderPresetEnabled('system-soft-highlight', false);

  expect(stored.defaultBorderPresetId).toBe('system-soft-highlight');
  expect(stored.borderPresets[0]).toMatchObject({
    enabled: false,
    id: 'system-default',
  });
  expect(stored.borderPresets[1]).toMatchObject({
    enabled: true,
    id: 'system-soft-highlight',
  });
});
