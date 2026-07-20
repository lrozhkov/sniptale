import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPreset, createSettings, createStoredSettings } from './test-helpers';

const { syncGetMock, syncSetMock, translateMock } = vi.hoisted(() => ({
  syncGetMock: vi.fn(),
  syncSetMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
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

async function loadHighlighterStorage() {
  return import('./index');
}

function resetHighlighterStorageMocks() {
  vi.clearAllMocks();
  vi.resetModules();
}

async function verifiesDefaultLoad() {
  syncGetMock.mockResolvedValue({});

  const module = await loadHighlighterStorage();
  const settings = await module.loadHighlighterSettings();

  expect(translateMock).toHaveBeenCalledWith('shared.defaults.defaultBorderPresetName');
  expect(settings).toEqual(module.DEFAULT_HIGHLIGHTER_SETTINGS);
}

async function verifiesLegacyBlurMigration() {
  syncGetMock.mockResolvedValue({
    sniptale_highlighter_settings: {
      borderPresets: [createPreset('preset-1')],
      defaultBorderPresetId: 'preset-1',
      defaultEffectMode: 'blur',
      defaultBlurSettings: {
        amount: 24,
        format: 'legacy',
      },
      defaultFocusSettings: {
        opacity: 0.75,
      },
    },
  });

  const { DEFAULT_BLUR_SETTINGS, loadHighlighterSettings } = await loadHighlighterStorage();

  await expect(loadHighlighterSettings()).resolves.toEqual({
    borderPresets: [createPreset('preset-1')],
    defaultBorderPresetId: 'preset-1',
    defaultEffectMode: 'blur',
    defaultBlurSettings: {
      ...DEFAULT_BLUR_SETTINGS,
      amount: 24,
      blurType: 'gaussian',
      showBorder: false,
    },
    defaultFocusSettings: {
      opacity: 0.75,
      showBorder: false,
    },
  });
}

async function verifiesSaveSettings() {
  const { getLoadedHighlighterSettingsSnapshot, saveHighlighterSettings } =
    await loadHighlighterStorage();

  await saveHighlighterSettings(createSettings());

  expect(syncSetMock).toHaveBeenCalledWith({
    sniptale_highlighter_settings: createSettings(),
  });
  expect(getLoadedHighlighterSettingsSnapshot()).toEqual(createSettings());
}

async function verifiesInvalidStoredSettingsAreDropped() {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  syncGetMock.mockResolvedValue({
    sniptale_highlighter_settings: {
      borderPresets: [createPreset('preset-1'), { id: 'broken' }],
      defaultBorderPresetId: 'missing',
      defaultEffectMode: 'invalid',
      defaultBlurSettings: {
        amount: 'wide',
        blurType: 'solid',
      },
      defaultFocusSettings: {
        opacity: 0.75,
        showBorder: 'yes',
      },
    },
  });

  const { DEFAULT_BLUR_SETTINGS, loadHighlighterSettings } = await loadHighlighterStorage();

  await expect(loadHighlighterSettings()).resolves.toEqual({
    borderPresets: [createPreset('preset-1')],
    defaultBorderPresetId: 'preset-1',
    defaultEffectMode: 'border',
    defaultBlurSettings: {
      ...DEFAULT_BLUR_SETTINGS,
      amount: 10,
      blurType: 'solid',
      showBorder: false,
    },
    defaultFocusSettings: {
      opacity: 0.75,
      showBorder: false,
    },
  });
  expect(warnSpy).toHaveBeenCalledWith(
    '[SharedHighlighterStorage]',
    'Dropped invalid highlighter settings fields from storage',
    { invalidFieldCount: 4 }
  );
}

async function verifiesAddAndUpdatePresetFlow() {
  syncGetMock.mockResolvedValue({
    sniptale_highlighter_settings: createSettings(),
  });

  const { addBorderPreset, updateBorderPreset } = await loadHighlighterStorage();

  await addBorderPreset(createPreset('preset-2', { order: 1 }));
  await updateBorderPreset(createPreset('preset-1', { name: 'Updated preset' }));

  expect(syncSetMock).toHaveBeenNthCalledWith(1, {
    sniptale_highlighter_settings: createSettings({
      borderPresets: [createPreset('preset-1'), createPreset('preset-2', { order: 1 })],
    }),
  });
  expect(syncSetMock).toHaveBeenNthCalledWith(2, {
    sniptale_highlighter_settings: createSettings({
      borderPresets: [
        createPreset('preset-1', { name: 'Updated preset' }),
        createPreset('preset-2', { order: 1 }),
      ],
    }),
  });
}

async function verifiesProtectedPresetUpdateBehavior() {
  syncGetMock.mockResolvedValue({
    sniptale_highlighter_settings: createSettings({
      borderPresets: [createPreset('preset-1', { isSystemDefault: true })],
    }),
  });

  const { updateBorderPreset } = await loadHighlighterStorage();

  await updateBorderPreset(createPreset('preset-1', { isSystemDefault: false, name: 'Edited' }));
  await updateBorderPreset(createPreset('preset-missing'));

  expect(syncSetMock).toHaveBeenCalledTimes(1);
  expect(syncSetMock).toHaveBeenCalledWith({
    sniptale_highlighter_settings: createSettings({
      borderPresets: [
        createPreset('preset-1', {
          enabled: true,
          isSystemDefault: true,
          name: 'Edited',
        }),
      ],
    }),
  });
}

async function verifiesDeletePresetBehavior() {
  syncGetMock.mockResolvedValue(createStoredSettings());

  const module = await loadHighlighterStorage();

  await expect(module.deleteBorderPreset('preset-2')).resolves.toBe(true);
  await expect(module.deleteBorderPreset('preset-1')).resolves.toBe(false);

  expect(syncSetMock).toHaveBeenCalledTimes(1);
  expect(syncSetMock).toHaveBeenCalledWith({
    sniptale_highlighter_settings: {
      ...module.DEFAULT_HIGHLIGHTER_SETTINGS,
      borderPresets: [createPreset('preset-1')],
      defaultBorderPresetId: 'preset-1',
    },
  });
}

async function verifiesPresetOrdering() {
  syncGetMock
    .mockResolvedValueOnce(createStoredSettings())
    .mockResolvedValueOnce(createStoredSettings())
    .mockResolvedValueOnce(createStoredSettings());

  const { setDefaultBorderPreset, updateBorderPresetsOrder } = await loadHighlighterStorage();

  await setDefaultBorderPreset('preset-2');
  await setDefaultBorderPreset('preset-missing');
  await updateBorderPresetsOrder(['preset-2']);

  expect(syncSetMock).toHaveBeenNthCalledWith(1, {
    sniptale_highlighter_settings: createSettings({
      borderPresets: [createPreset('preset-1'), createPreset('preset-2', { order: 1 })],
      defaultBorderPresetId: 'preset-2',
    }),
  });
  expect(syncSetMock).toHaveBeenNthCalledWith(2, {
    sniptale_highlighter_settings: createSettings({
      borderPresets: [
        createPreset('preset-2', { order: 0 }),
        createPreset('preset-1', { order: 1 }),
      ],
      defaultBorderPresetId: 'preset-2',
    }),
  });
}

async function verifiesDefaultEffectSettingUpdates() {
  syncGetMock.mockResolvedValue(createStoredSettings());

  const { saveDefaultBlurSettings, saveDefaultFocusSettings } = await loadHighlighterStorage();

  await saveDefaultBlurSettings({
    amount: 18,
    blurType: 'solid',
    showBorder: true,
  });
  await saveDefaultFocusSettings({
    opacity: 0.8,
    showBorder: true,
  });

  expect(syncSetMock).toHaveBeenNthCalledWith(1, {
    sniptale_highlighter_settings: createSettings({
      borderPresets: [createPreset('preset-1'), createPreset('preset-2', { order: 1 })],
      defaultBorderPresetId: 'preset-2',
      defaultBlurSettings: {
        amount: 18,
        blurType: 'solid',
        showBorder: true,
      },
    }),
  });
  expect(syncSetMock).toHaveBeenNthCalledWith(2, {
    sniptale_highlighter_settings: createSettings({
      borderPresets: [createPreset('preset-1'), createPreset('preset-2', { order: 1 })],
      defaultBorderPresetId: 'preset-2',
      defaultBlurSettings: {
        amount: 18,
        blurType: 'solid',
        showBorder: true,
      },
      defaultFocusSettings: {
        opacity: 0.8,
        showBorder: true,
      },
    }),
  });
}

describe('highlighter', () => {
  beforeEach(resetHighlighterStorageMocks);

  it('loads default settings when storage is empty', verifiesDefaultLoad);
  it('migrates legacy blur settings and merges focus defaults', verifiesLegacyBlurMigration);
  it(
    'drops invalid stored fields and repairs default preset selection',
    verifiesInvalidStoredSettingsAreDropped
  );
  it('saves settings directly to sync storage', verifiesSaveSettings);
  it('adds and updates border presets through persisted settings', verifiesAddAndUpdatePresetFlow);
  it(
    'preserves system defaults and skips missing preset updates',
    verifiesProtectedPresetUpdateBehavior
  );
  it('deletes custom presets and resets default preset when needed', verifiesDeletePresetBehavior);
  it('sets default presets and reorders them predictably', verifiesPresetOrdering);
  it(
    'updates default blur and focus settings through shared storage',
    verifiesDefaultEffectSettingUpdates
  );
});
