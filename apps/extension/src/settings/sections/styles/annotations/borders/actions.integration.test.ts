// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { createDefaultHighlighterSettings } from '../../../../../features/highlighter/style/defaults';
import { createHighlighterOrderingActions } from './ordering-actions';
import { createHighlighterSettingsActions } from './persistence-actions';

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  reorder: vi.fn(),
  saveBlur: vi.fn(),
  saveFocus: vi.fn(),
  setDefault: vi.fn(),
}));

vi.mock('../../../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal()),
  loadHighlighterSettings: mocks.load,
  saveDefaultBlurSettings: mocks.saveBlur,
  saveDefaultFocusSettings: mocks.saveFocus,
  setDefaultBorderPreset: mocks.setDefault,
  updateBorderPresetsOrder: mocks.reorder,
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

function createState() {
  const state = {
    settingsPersistenceSession: {},
    settings: createDefaultHighlighterSettings(),
    setSettings(value: ReturnType<typeof createDefaultHighlighterSettings> | null) {
      if (value) state.settings = value;
    },
  };
  return state;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockImplementation(async () => createDefaultHighlighterSettings());
  mocks.reorder.mockResolvedValue(true);
  mocks.saveBlur.mockResolvedValue(true);
  mocks.saveFocus.mockResolvedValue(true);
  mocks.setDefault.mockResolvedValue(true);
});

it('routes reorder/default/blur/focus through canonical owner commands', async () => {
  const state = createState();
  const ordering = createHighlighterOrderingActions(state);
  const settings = createHighlighterSettingsActions(state);
  await ordering.handleMoveBefore('system-default', 'system-marker');
  expect(mocks.reorder).toHaveBeenCalledWith([
    'system-soft-highlight',
    'system-sunrise',
    'system-default',
    'system-marker',
    'system-success',
    'system-sticky-note',
    'system-attention',
    'system-review',
    'system-dark-ui',
    'system-light-ui',
    'system-editorial-ink',
    'system-editorial-proof',
    'system-retro-sunset',
    'system-retro-arcade',
    'system-retro-memphis',
  ]);
  await settings.handleSetDefaultPreset('system-soft-highlight');
  await settings.handleUpdateBlurSettings({ amount: 8, blurType: 'solid', showBorder: true });
  await settings.handleUpdateFocusSettings({ opacity: 0.7, showBorder: false });

  expect(mocks.setDefault).toHaveBeenCalledWith('system-soft-highlight');
  expect(mocks.saveBlur).toHaveBeenCalledOnce();
  expect(mocks.saveFocus).toHaveBeenCalledOnce();
});
