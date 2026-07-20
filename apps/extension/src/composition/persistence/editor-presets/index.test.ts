import { beforeEach, describe, expect, it, vi } from 'vitest';

const browserStorageMocks = vi.hoisted(() => {
  const listeners: Array<
    (changes: Record<string, { newValue?: unknown }>, areaName: string) => void
  > = [];

  return {
    canObserveChangesMock: vi.fn(() => true),
    emitChange: (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      listeners.forEach((listener) => listener(changes, areaName));
    },
    getMock: vi.fn(),
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
    resetListeners: () => {
      listeners.length = 0;
    },
  };
});

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  warn: vi.fn(),
}));

const translateMock = vi.hoisted(() => vi.fn((key: string) => key));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    canObserveChanges: browserStorageMocks.canObserveChangesMock,
    local: {
      get: browserStorageMocks.getMock,
      set: browserStorageMocks.setMock,
    },
    subscribeToChanges: browserStorageMocks.subscribeToChangesMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => loggerMocks,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

async function loadStorageModule() {
  return import('./index');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  browserStorageMocks.resetListeners();
  browserStorageMocks.canObserveChangesMock.mockReturnValue(true);
  browserStorageMocks.getMock.mockResolvedValue({});
  browserStorageMocks.setMock.mockResolvedValue(undefined);
});

function registerLoadAndSnapshotTest() {
  it('loads defaults, warns on malformed payloads, and returns detached snapshots', async () => {
    browserStorageMocks.getMock.mockResolvedValueOnce({}).mockResolvedValueOnce({
      sniptale_editor_presets: {
        pencil: {
          defaultPresetId: 'broken',
          presets: [{ id: 'broken' }],
        },
      },
    });

    const module = await loadStorageModule();
    const defaults = await module.loadEditorPresetState();
    const malformed = await module.loadEditorPresetState();
    const firstSnapshot = module.getLoadedEditorPresetStateSnapshot();
    const secondSnapshot = module.getLoadedEditorPresetStateSnapshot();

    expect(defaults.pencil.presets[0]).toMatchObject({
      id: 'system-default',
      isSystemDefault: true,
    });
    expect(loggerMocks.warn).toHaveBeenCalledWith(
      'Dropped invalid editor preset settings fields from storage',
      { invalidFieldCount: 1 }
    );

    firstSnapshot?.palette.shapeStroke.splice(0, 1);

    expect(malformed.pencil.presets[0]!.isSystemDefault).toBe(true);
    expect(secondSnapshot?.palette.shapeStroke.length).toBeGreaterThan(
      firstSnapshot?.palette.shapeStroke.length ?? 0
    );
  });
}

function registerSubscriptionTest() {
  it('subscribes to local storage changes and ignores unrelated notifications', async () => {
    const module = await loadStorageModule();
    const listener = vi.fn();
    const unsubscribe = module.subscribeToEditorPresetState(listener);

    browserStorageMocks.emitChange(
      {
        sniptale_editor_presets: {
          newValue: { pencil: { defaultPresetId: 'broken', presets: [] } },
        },
      },
      'sync'
    );
    browserStorageMocks.emitChange({}, 'local');
    browserStorageMocks.emitChange(
      {
        sniptale_editor_presets: {
          newValue: {
            palette: {
              sceneBackground: ['#111111'],
              shapeFill: ['#222222'],
              shapeStroke: ['#333333'],
              textBackground: ['#444444'],
              textColor: ['#555555'],
            },
          },
        },
      },
      'local'
    );

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0]?.[0].palette.shapeStroke).toEqual(['#333333']);

    unsubscribe();
    browserStorageMocks.emitChange({ sniptale_editor_presets: { newValue: {} } }, 'local');

    expect(listener).toHaveBeenCalledTimes(1);
  });
}

function registerNoopSubscriptionTest() {
  it('returns a noop subscription when browser storage cannot observe changes', async () => {
    browserStorageMocks.canObserveChangesMock.mockReturnValue(false);

    const module = await loadStorageModule();
    const unsubscribe = module.subscribeToEditorPresetState(vi.fn());

    expect(browserStorageMocks.subscribeToChangesMock).not.toHaveBeenCalled();
    expect(unsubscribe).toBeTypeOf('function');
  });
}

function registerEditorPresetStorageTests() {
  registerLoadAndSnapshotTest();
  registerSubscriptionTest();
  registerNoopSubscriptionTest();
}

describe('editor preset storage public API', registerEditorPresetStorageTests);
