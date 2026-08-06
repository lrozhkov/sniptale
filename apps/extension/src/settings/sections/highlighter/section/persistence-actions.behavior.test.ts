// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultHighlighterSettings } from '../../../../features/highlighter/style/defaults';
import { createHighlighterSettingsActions } from './persistence-actions';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  saveBlur: vi.fn(),
  saveFocus: vi.fn(),
  setDefault: vi.fn(),
  setEnabled: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal()),
  loadHighlighterSettings: mocks.load,
  saveDefaultBlurSettings: mocks.saveBlur,
  saveDefaultFocusSettings: mocks.saveFocus,
  setBorderPresetEnabled: mocks.setEnabled,
  setDefaultBorderPreset: mocks.setDefault,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

function createState(settings = createDefaultHighlighterSettings()) {
  const state = {
    settingsPersistenceSession: {},
    settings,
    setSettings(value: typeof settings | null) {
      if (value) state.settings = value;
    },
  };
  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockReset();
  mocks.saveBlur.mockResolvedValue(true);
  mocks.saveFocus.mockResolvedValue(true);
  mocks.setDefault.mockResolvedValue(true);
  mocks.setEnabled.mockResolvedValue(true);
});

describe('highlighter settings canonical actions', () => {
  it('no-ops before settings have loaded', async () => {
    const actions = createHighlighterSettingsActions({
      settingsPersistenceSession: {},
      settings: null,
      setSettings: vi.fn(),
    });

    await actions.handleSetDefaultPreset('system-default');
    await actions.handleTogglePresetEnabled('system-default');
    expect(mocks.setDefault).not.toHaveBeenCalled();
    expect(mocks.setEnabled).not.toHaveBeenCalled();
  });

  it('delegates default and enable invariants to persistence then commits the reread', async () => {
    const state = createState();
    const confirmed = {
      ...createDefaultHighlighterSettings(),
      defaultBorderPresetId: 'system-soft-highlight',
      catalogCustomized: true,
    };
    confirmed.borderPresets = confirmed.borderPresets.map((preset) =>
      preset.id === 'system-default' ? { ...preset, enabled: false } : preset
    );
    mocks.load.mockResolvedValue(confirmed);
    const actions = createHighlighterSettingsActions(state);

    await actions.handleTogglePresetEnabled('system-default');

    expect(mocks.setEnabled).toHaveBeenCalledWith('system-default', false);
    expect(state.settings).toEqual(confirmed);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('highlighter.section.templateHidden');
  });

  it('does not emit success when the owner rejects the last-enabled toggle', async () => {
    const state = createState();
    mocks.setEnabled.mockResolvedValue(false);
    mocks.load.mockResolvedValue(state.settings);
    const actions = createHighlighterSettingsActions(state);

    await actions.handleTogglePresetEnabled('system-default');

    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('surfaces persistence failures and leaves success feedback silent', async () => {
    const state = createState();
    mocks.setDefault.mockRejectedValue(new Error('failed'));
    const actions = createHighlighterSettingsActions(state);

    await actions.handleSetDefaultPreset('system-soft-highlight');

    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(
      'common.states.errorhighlighter.section.saveErrorSuffix'
    );
  });
});
