// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BorderPreset, HighlighterSettings } from '../../../../features/highlighter/contracts';
import { createHighlighterSettingsActions } from './persistence-actions';

const {
  loadHighlighterSettingsMock,
  loggerErrorMock,
  saveHighlighterSettingsMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  loadHighlighterSettingsMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  saveHighlighterSettingsMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('../../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal()),
  loadHighlighterSettings: loadHighlighterSettingsMock,
  saveHighlighterSettings: saveHighlighterSettingsMock,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

beforeEach(() => {
  vi.clearAllMocks();
  loadHighlighterSettingsMock.mockReset();
});

function trackPersistedSettings(settings: ReturnType<typeof createSettings>) {
  let persistedSettings = settings;
  loadHighlighterSettingsMock.mockImplementation(async () => persistedSettings);
  saveHighlighterSettingsMock.mockImplementation(async (nextSettings) => {
    persistedSettings = nextSettings;
  });
}

function requireLoadedSettings(settings: HighlighterSettings | null): HighlighterSettings {
  if (!settings) {
    throw new Error('Expected loaded highlighter settings in test fixture.');
  }

  return settings;
}

function createPreset(id: string): BorderPreset {
  return {
    id,
    name: id,
    order: 0,
    width: 2,
    color: '#00aaee',
    style: 'solid',
    radius: 4,
    padding: { top: 1, right: 1, bottom: 1, left: 1 },
    shadow: 0,
    opacity: 100,
    customCss: '',
    fillColor: '#00000000',
    fillOpacity: 0,
    inheritCustomCss: false,
    strokeOpacity: 100,
  };
}

function createSettings(): HighlighterSettings {
  return {
    borderPresets: [],
    defaultBorderPresetId: 'preset-1',
    defaultEffectMode: 'border',
    defaultBlurSettings: {
      amount: 4,
      blurType: 'gaussian' as const,
      showBorder: false,
    },
    defaultFocusSettings: {
      opacity: 0.6,
      showBorder: true,
    },
  };
}

function createState(settings: HighlighterSettings | null = createSettings()) {
  const state = {
    settingsPersistenceSession: {},
    settings,
    setSettings: vi.fn((value: HighlighterSettings | null) => {
      state.settings = value;
    }),
  };

  return state;
}

async function runNullStateActions() {
  const state = {
    settingsPersistenceSession: {},
    settings: null,
    setSettings: vi.fn(),
  };
  const settingsActions = createHighlighterSettingsActions(state);

  await settingsActions.handleSetDefaultPreset('preset-1');
  await settingsActions.handleUpdateBlurSettings({
    amount: 4,
    blurType: 'gaussian',
    showBorder: false,
  });
  await settingsActions.handleUpdateFocusSettings({
    opacity: 0.6,
    showBorder: true,
  });
}

async function runFailedDefaultPresetSave(state = createState()) {
  trackPersistedSettings(requireLoadedSettings(state.settings));
  saveHighlighterSettingsMock.mockRejectedValueOnce(new Error('save failed'));
  const settingsActions = createHighlighterSettingsActions(state);
  await settingsActions.handleSetDefaultPreset('preset-2');
  return state;
}

async function runFailedSettingsUpdates(state = createState()) {
  const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
  trackPersistedSettings(requireLoadedSettings(state.settings));
  saveHighlighterSettingsMock.mockRejectedValueOnce(new Error('blur failed'));
  saveHighlighterSettingsMock.mockRejectedValueOnce(new Error('focus failed'));
  const settingsActions = createHighlighterSettingsActions(state);

  await settingsActions.handleUpdateBlurSettings({
    amount: 9,
    blurType: 'distortion',
    showBorder: false,
  });
  await settingsActions.handleUpdateFocusSettings({
    opacity: 0.7,
    showBorder: false,
  });

  return { dispatchEventSpy, state };
}

async function togglePreset(state = createState(), presetId = 'preset-2') {
  trackPersistedSettings(requireLoadedSettings(state.settings));
  const settingsActions = createHighlighterSettingsActions(state);
  await settingsActions.handleTogglePresetEnabled(presetId);
  return state;
}

function registerNullStateNoOpTest() {
  it('no-ops settings actions when settings have not loaded yet', async () => {
    await runNullStateActions();

    expect(saveHighlighterSettingsMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(loggerErrorMock).not.toHaveBeenCalled();
  });
}

function registerFailedDefaultPresetSaveTest() {
  it('does not emit success side effects when saving the default preset fails', async () => {
    const state = await runFailedDefaultPresetSave(
      createState({
        ...createSettings(),
        borderPresets: [createPreset('preset-1'), createPreset('preset-2')],
      })
    );

    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(state.settings).toEqual(
      expect.objectContaining({
        borderPresets: [createPreset('preset-1'), createPreset('preset-2')],
      })
    );
    expect(toastErrorMock).toHaveBeenCalledWith(
      'common.states.errorhighlighter.section.saveErrorSuffix'
    );
  });
}

function registerFailedSettingsUpdateTest() {
  it('does not dispatch the settings-changed event when blur or focus persistence fails', async () => {
    const { dispatchEventSpy, state } = await runFailedSettingsUpdates();

    expect(dispatchEventSpy).not.toHaveBeenCalled();
    expect(state.settings).toEqual(createSettings());
  });
}

function registerMissingPresetRereadTest() {
  it('does not persist or emit success when reread settings no longer contain the requested preset', async () => {
    const state = createState({
      ...createSettings(),
      borderPresets: [createPreset('preset-1'), createPreset('preset-2')],
    });
    trackPersistedSettings({
      ...createSettings(),
      borderPresets: [createPreset('preset-1')],
    });
    const settingsActions = createHighlighterSettingsActions(state);

    await settingsActions.handleSetDefaultPreset('preset-2');

    expect(saveHighlighterSettingsMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(state.settings).toEqual({
      ...createSettings(),
      borderPresets: [createPreset('preset-1')],
    });
  });
}

function registerVisibilityToggleTest() {
  it('toggles preset visibility and falls back to another enabled preset as default', async () => {
    const state = await togglePreset(
      createState({
        ...createSettings(),
        borderPresets: [
          { ...createPreset('preset-1'), isSystemDefault: true },
          createPreset('preset-2'),
        ],
        defaultBorderPresetId: 'preset-2',
      })
    );

    expect(toastSuccessMock).toHaveBeenCalledWith('savePresets.messages.presetHidden');
    expect(state.settings).toMatchObject({
      defaultBorderPresetId: 'preset-1',
      borderPresets: [
        { ...createPreset('preset-1'), isSystemDefault: true },
        { ...createPreset('preset-2'), enabled: false },
      ],
    });
  });
}

function registerIgnoredToggleTest() {
  it('ignores visibility toggles for missing and system presets', async () => {
    const state = createState({
      ...createSettings(),
      borderPresets: [{ ...createPreset('preset-1'), isSystemDefault: true }],
    });
    const settingsActions = createHighlighterSettingsActions(state);

    await settingsActions.handleTogglePresetEnabled('preset-1');
    await settingsActions.handleTogglePresetEnabled('missing');

    expect(saveHighlighterSettingsMock).not.toHaveBeenCalled();
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });
}

function registerNullStateGuardTests() {
  registerNullStateNoOpTest();
  registerFailedDefaultPresetSaveTest();
  registerFailedSettingsUpdateTest();
  registerMissingPresetRereadTest();
  registerVisibilityToggleTest();
  registerIgnoredToggleTest();
}

describe('highlighter settings action null-state guards', registerNullStateGuardTests);
