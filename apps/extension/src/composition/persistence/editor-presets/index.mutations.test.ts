import { beforeEach, describe, expect, it, vi } from 'vitest';

const browserStorageMocks = vi.hoisted(() => ({
  canObserveChangesMock: vi.fn(() => true),
  getMock: vi.fn(),
  setMock: vi.fn(),
  subscribeToChangesMock: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  warn: vi.fn(),
}));

const translateMock = vi.hoisted(() => vi.fn((key: string) => key));

vi.mock('../infrastructure/browser-storage', () => ({
  BrowserStorageAdapter: {},
  BrowserStorageAreaAdapter: {},
  BrowserStorageChangeListener: {},
  BrowserStorageChanges: {},
  BrowserStorageGetKeys: {},
  BrowserStorageSetItems: {},
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
  Logger: {},
  createLogger: () => loggerMocks,
  isTraceEnabled: vi.fn(() => false),
}));

vi.mock('../../../platform/i18n', () => ({
  AppLocale: {},
  DEFAULT_LOCALE: 'en',
  FALLBACK_LOCALE: 'en',
  SUPPORTED_LOCALES: ['en'],
  Translate: {},
  TranslationDictionary: {},
  TranslationKey: {},
  compareStrings: vi.fn((left: string, right: string) => left.localeCompare(right)),
  createTranslator: vi.fn(() => translateMock),
  formatDateTime: vi.fn(),
  formatNumber: vi.fn(),
  getCurrentLocale: vi.fn(() => 'en'),
  getDictionary: vi.fn(() => ({})),
  getStoredLocalePreference: vi.fn(),
  setLocalePreference: vi.fn(),
  subscribeToLocaleChanges: vi.fn(() => vi.fn()),
  translate: translateMock,
  useAppLocale: vi.fn(() => 'en'),
  usePageLocaleMetadata: vi.fn(),
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

async function loadStorageModule() {
  return import('./index');
}

async function flushStorageMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function expectQueuedStepPresets(stored: { step: { presets: unknown[] } }) {
  expect(stored.step.presets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'step-user' }),
      expect.objectContaining({
        enabled: true,
        id: 'system-default',
        isSystemDefault: true,
        name: 'Updated step default',
      }),
    ])
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  browserStorageMocks.canObserveChangesMock.mockReturnValue(true);
  browserStorageMocks.getMock.mockResolvedValue({});
  browserStorageMocks.setMock.mockResolvedValue(undefined);
});

function registerPersistenceMutationTest() {
  it('persists direct saves and queued mutations across preset operations', async () => {
    const module = await loadStorageModule();
    const base = module.createDefaultEditorPresetStorageState();
    const userPreset = {
      ...base.arrow.presets[0]!,
      id: 'arrow-user',
      isSystemDefault: false,
      name: 'Arrow user',
      order: 1,
    };
    let stored = module.cloneEditorPresetStorageState(base);

    browserStorageMocks.getMock.mockImplementation(async () => ({
      sniptale_editor_presets: stored,
    }));
    browserStorageMocks.setMock.mockImplementation(async (payload) => {
      stored = module.cloneEditorPresetStorageState(payload.sniptale_editor_presets);
    });

    await module.saveEditorPresetState(base);
    await module.addEditorPreset('arrow', userPreset);
    await module.updateEditorPreset('arrow', { ...userPreset, name: 'Arrow updated' });
    await module.setDefaultEditorPreset('arrow', 'arrow-user');
    await module.setEditorPresetEnabled('arrow', 'arrow-user', false);
    await module.updateEditorPresetOrder('arrow', ['arrow-user']);
    await module.saveEditorPaletteSettings({
      ...stored.palette,
      textColor: ['#abcdef'],
    });
    const userPresetState = stored.arrow.presets.find((preset) => preset.id === 'arrow-user');

    expect(stored.arrow.defaultPresetId).toBe('system-default');
    expect(userPresetState).toMatchObject({
      enabled: false,
      id: 'arrow-user',
      name: 'Arrow updated',
      order: 0,
    });
    expect(stored.palette.textColor).toEqual(['#abcdef']);
    expect(browserStorageMocks.setMock).toHaveBeenCalled();
    expect(loggerMocks.debug).toHaveBeenCalledWith('Saved editor preset settings');
  });
}

function registerProtectedBranchTest() {
  it('keeps protected branches as no-ops for missing, disabled, or system presets', async () => {
    const module = await loadStorageModule();
    const base = module.createDefaultEditorPresetStorageState();
    const userPreset = {
      ...base.text.presets[0]!,
      enabled: false,
      id: 'text-user',
      isSystemDefault: false,
      name: 'Text user',
      order: 1,
    };
    let stored = module.cloneEditorPresetStorageState({
      ...base,
      text: {
        defaultPresetId: 'system-default',
        presets: [base.text.presets[0]!, userPreset],
      },
    });

    browserStorageMocks.getMock.mockImplementation(async () => ({
      sniptale_editor_presets: stored,
    }));
    browserStorageMocks.setMock.mockImplementation(async (payload) => {
      stored = module.cloneEditorPresetStorageState(payload.sniptale_editor_presets);
    });

    await module.updateEditorPreset('text', { ...userPreset, id: 'missing' });
    await module.deleteEditorPreset('text', 'system-default');
    await module.setDefaultEditorPreset('text', 'text-user');
    await module.setEditorPresetEnabled('text', 'system-default', false);

    expect(browserStorageMocks.setMock).not.toHaveBeenCalled();
    expect(stored.text.defaultPresetId).toBe('system-default');
  });
}

function registerQueuedWriteTest() {
  it('serializes queued writes so later mutations read the newest snapshot', async () => {
    const module = await loadStorageModule();
    const base = module.createDefaultEditorPresetStorageState();
    const deferredWrite = createDeferred();
    let stored = module.cloneEditorPresetStorageState(base);

    browserStorageMocks.getMock.mockImplementation(async () => ({
      sniptale_editor_presets: stored,
    }));
    browserStorageMocks.setMock
      .mockImplementationOnce((payload) => {
        stored = module.cloneEditorPresetStorageState(payload.sniptale_editor_presets);
        return deferredWrite.promise;
      })
      .mockImplementation(async (payload) => {
        stored = module.cloneEditorPresetStorageState(payload.sniptale_editor_presets);
      });

    const first = module.addEditorPreset('step', {
      ...base.step.presets[0]!,
      id: 'step-user',
      isSystemDefault: false,
      name: 'Step user',
      order: 1,
    });
    const second = module.updateEditorPreset('step', {
      ...base.step.presets[0]!,
      id: 'system-default',
      name: 'Updated step default',
      order: 0,
    });

    await flushStorageMicrotasks();
    expect(browserStorageMocks.setMock).toHaveBeenCalledTimes(1);

    deferredWrite.resolve();
    await Promise.all([first, second]);

    expectQueuedStepPresets(stored);
  });
}

function registerEditorPresetMutationTests() {
  registerPersistenceMutationTest();
  registerProtectedBranchTest();
  registerQueuedWriteTest();
}

describe('editor preset storage mutations', registerEditorPresetMutationTests);
