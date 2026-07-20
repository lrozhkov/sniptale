// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import type { BorderPreset, HighlighterSettings } from '../../../../features/highlighter/contracts';
import { createHighlighterDragActions } from './drag-actions';
import { createHighlighterSettingsActions } from './persistence-actions';

const {
  loadHighlighterSettingsMock,
  saveHighlighterSettingsMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  loadHighlighterSettingsMock: vi.fn(),
  saveHighlighterSettingsMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal()),
  createLogger: () => ({
    error: vi.fn(),
  }),
}));

vi.mock('../../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal()),
  DEFAULT_BORDER_PRESET: { id: 'default-preset' },
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

function createPreset(overrides: Partial<BorderPreset> = {}): BorderPreset {
  return {
    id: overrides.id ?? 'preset-1',
    name: overrides.name ?? 'Preset 1',
    order: overrides.order ?? 0,
    width: overrides.width ?? 2,
    color: overrides.color ?? '#00aaee',
    style: overrides.style ?? 'solid',
    radius: overrides.radius ?? 4,
    padding: overrides.padding ?? { top: 1, right: 1, bottom: 1, left: 1 },
    shadow: overrides.shadow ?? 0,
    opacity: overrides.opacity ?? 100,
    customCss: overrides.customCss ?? '',
    fillColor: overrides.fillColor ?? '#00000000',
    fillOpacity: overrides.fillOpacity ?? 0,
    inheritCustomCss: overrides.inheritCustomCss ?? false,
    strokeOpacity: overrides.strokeOpacity ?? 100,
    ...(overrides.isSystemDefault === undefined
      ? {}
      : { isSystemDefault: overrides.isSystemDefault }),
  };
}

function createSettings(overrides: Partial<HighlighterSettings> = {}): HighlighterSettings {
  return {
    borderPresets: overrides.borderPresets ?? [createPreset()],
    defaultBorderPresetId: overrides.defaultBorderPresetId ?? 'preset-1',
    defaultEffectMode: overrides.defaultEffectMode ?? 'border',
    defaultBlurSettings: overrides.defaultBlurSettings ?? {
      amount: 3,
      blurType: 'gaussian',
      showBorder: false,
    },
    defaultFocusSettings: overrides.defaultFocusSettings ?? {
      opacity: 0.5,
      showBorder: true,
    },
  };
}

function createSectionState(settings: HighlighterSettings | null) {
  const state = {
    draggedId: null as string | null,
    dragOverId: null as string | null,
    editingPreset: undefined as BorderPreset | undefined,
    hoveredPresetId: null as string | null,
    isEditorOpen: false,
    isLoading: false,
    settingsPersistenceSession: {},
    settings,
    setDraggedId(value: string | null) {
      state.draggedId = value;
    },
    setDragOverId(value: string | null) {
      state.dragOverId = value;
    },
    setEditingPreset(value: BorderPreset | undefined) {
      state.editingPreset = value;
    },
    setHoveredPresetId(value: string | null) {
      state.hoveredPresetId = value;
    },
    setIsEditorOpen(value: boolean) {
      state.isEditorOpen = value;
    },
    setSettings(value: HighlighterSettings | null) {
      state.settings = value;
    },
  };

  return state;
}

function createDragEvent() {
  return {
    dataTransfer: {
      effectAllowed: 'none',
    },
    preventDefault: vi.fn(),
  };
}

function trackPersistedSettings(settings: HighlighterSettings) {
  let persistedSettings = settings;
  loadHighlighterSettingsMock.mockImplementation(async () => persistedSettings);
  saveHighlighterSettingsMock.mockImplementation(async (nextSettings) => {
    persistedSettings = nextSettings;
  });
}

function createReorderHarness() {
  const firstPreset = createPreset({ id: 'preset-1', isSystemDefault: true, order: 0 });
  const secondPreset = createPreset({ id: 'preset-2', order: 1 });
  const state = createSectionState(createSettings({ borderPresets: [firstPreset, secondPreset] }));
  trackPersistedSettings(state.settings!);

  return {
    drag: createHighlighterDragActions(state),
    dragEvent: createDragEvent(),
    settingsActions: createHighlighterSettingsActions(state),
    state,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadHighlighterSettingsMock.mockReset();
  saveHighlighterSettingsMock.mockResolvedValue(undefined);
});

it('reorders presets, resets drag state, and persists default/blur/focus changes', async () => {
  const { drag, dragEvent, settingsActions, state } = createReorderHarness();

  drag.handleDragStart(dragEvent, 'preset-1');
  drag.handleDragOver(dragEvent, 'preset-2');
  expect(state.draggedId).toBe('preset-1');
  expect(state.dragOverId).toBe('preset-2');

  await drag.handleDrop(dragEvent, 'preset-2');
  expect(saveHighlighterSettingsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      borderPresets: [
        expect.objectContaining({ id: 'preset-2', order: 0 }),
        expect.objectContaining({ id: 'preset-1', order: 1 }),
      ],
    })
  );
  expect(state.draggedId).toBeNull();
  expect(state.dragOverId).toBeNull();

  state.draggedId = 'preset-1';
  state.dragOverId = 'preset-2';
  await drag.handleDrop(dragEvent, 'preset-1');
  expect(state.draggedId).toBeNull();
  expect(state.dragOverId).toBeNull();

  await settingsActions.handleSetDefaultPreset('preset-2');
  expect(saveHighlighterSettingsMock).toHaveBeenCalledWith(
    expect.objectContaining({ defaultBorderPresetId: 'preset-2' })
  );
  expect(toastSuccessMock).toHaveBeenCalledWith('highlighter.section.defaultUpdated');

  await settingsActions.handleUpdateBlurSettings({
    amount: 8,
    blurType: 'solid',
    showBorder: true,
  });
  await settingsActions.handleUpdateFocusSettings({
    opacity: 0.7,
    showBorder: false,
  });

  expect(toastErrorMock).not.toHaveBeenCalled();
});
