// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { createDefaultHighlighterSettings } from '../../../../../features/highlighter/style/defaults';
import { createHighlighterDragActions } from './drag-actions';
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
    draggedId: null as string | null,
    dragOverId: null as string | null,
    settingsPersistenceSession: {},
    settings: createDefaultHighlighterSettings(),
    setDraggedId(value: string | null) {
      state.draggedId = value;
    },
    setDragOverId(value: string | null) {
      state.dragOverId = value;
    },
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
  const drag = createHighlighterDragActions(state);
  const settings = createHighlighterSettingsActions(state);
  const event = { dataTransfer: { effectAllowed: 'none' }, preventDefault: vi.fn() };

  drag.handleDragStart(event, 'system-default');
  await drag.handleDrop(event, 'system-soft-highlight');
  expect(mocks.reorder).toHaveBeenCalledWith([
    'system-soft-highlight',
    'system-default',
    'system-marker',
    'system-success',
    'system-attention',
    'system-review',
    'system-light-ui',
    'system-dark-ui',
  ]);
  expect(state.draggedId).toBeNull();

  await settings.handleSetDefaultPreset('system-soft-highlight');
  await settings.handleUpdateBlurSettings({ amount: 8, blurType: 'solid', showBorder: true });
  await settings.handleUpdateFocusSettings({ opacity: 0.7, showBorder: false });

  expect(mocks.setDefault).toHaveBeenCalledWith('system-soft-highlight');
  expect(mocks.saveBlur).toHaveBeenCalledOnce();
  expect(mocks.saveFocus).toHaveBeenCalledOnce();
});
