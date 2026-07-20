// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import type { BorderPreset, HighlighterSettings } from '../../../../features/highlighter/contracts';
import { createHighlighterCrudActions } from './crud-actions';
import { createHighlighterDragActions } from './drag-actions';
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

beforeEach(() => {
  vi.clearAllMocks();
  loadHighlighterSettingsMock.mockReset();
  saveHighlighterSettingsMock.mockResolvedValue(undefined);
});

function trackPersistedSettings(settings: HighlighterSettings) {
  let persistedSettings = settings;
  loadHighlighterSettingsMock.mockImplementation(async () => persistedSettings);
  saveHighlighterSettingsMock.mockImplementation(async (nextSettings) => {
    persistedSettings = nextSettings;
  });
}

it('opens editor, saves presets, and deletes non-system presets', async () => {
  const firstPreset = createPreset({ id: 'preset-1', isSystemDefault: true });
  const secondPreset = createPreset({ id: 'preset-2', name: 'Preset 2', order: 1 });
  const state = createSectionState(
    createSettings({
      borderPresets: [firstPreset, secondPreset],
      defaultBorderPresetId: 'preset-2',
    })
  );
  trackPersistedSettings(state.settings!);
  const crud = createHighlighterCrudActions(state);

  crud.handleAddPreset();
  expect(state.isEditorOpen).toBe(true);
  expect(state.editingPreset).toBeUndefined();

  crud.handleEditPreset(secondPreset);
  expect(state.editingPreset).toEqual(secondPreset);

  const createdPreset = createPreset({ id: 'preset-3', name: 'Preset 3', order: 2 });
  await crud.handleSavePreset(createdPreset);
  expect(saveHighlighterSettingsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      borderPresets: [
        expect.objectContaining({ id: 'preset-1', order: 0 }),
        expect.objectContaining({ id: 'preset-2', order: 1 }),
        expect.objectContaining({ id: 'preset-3', order: 2 }),
      ],
    })
  );
  expect(state.isEditorOpen).toBe(false);
  expect(toastSuccessMock).toHaveBeenCalledWith('highlighter.section.presetCreated');

  await crud.handleDeletePreset(secondPreset);
  expect(saveHighlighterSettingsMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      borderPresets: [
        expect.objectContaining({ id: 'preset-1', order: 0 }),
        expect.objectContaining({ id: 'preset-3', order: 1 }),
      ],
      defaultBorderPresetId: 'default-preset',
    })
  );
  expect(toastSuccessMock).toHaveBeenCalledWith('highlighter.section.presetDeleted');
});

it('blocks invalid deletes and logs save failures', async () => {
  const systemPreset = createPreset({ id: 'preset-1', isSystemDefault: true });
  const state = createSectionState(createSettings({ borderPresets: [systemPreset] }));
  trackPersistedSettings(state.settings!);
  const crud = createHighlighterCrudActions(state);

  await crud.handleDeletePreset(systemPreset);
  expect(toastErrorMock).toHaveBeenCalledWith('highlighter.section.systemPresetDeleteError');

  const userPreset = createPreset({ id: 'preset-2', isSystemDefault: false });
  state.setSettings(createSettings({ borderPresets: [userPreset] }));
  trackPersistedSettings(state.settings!);
  await crud.handleDeletePreset(userPreset);
  expect(toastErrorMock).toHaveBeenCalledWith('highlighter.section.lastPresetDeleteError');

  saveHighlighterSettingsMock.mockRejectedValueOnce(new Error('save failed'));
  state.setSettings(createSettings({ borderPresets: [systemPreset, userPreset] }));
  trackPersistedSettings(state.settings!);
  await crud.handleSavePreset(createPreset({ id: 'preset-2', name: 'Updated preset' }));

  expect(loggerErrorMock).toHaveBeenCalledWith(
    'Failed to save highlighter preset',
    expect.any(Error)
  );
  expect(toastErrorMock).toHaveBeenCalledWith(
    'common.states.errorhighlighter.section.saveErrorSuffix'
  );
});

it('refuses to delete the last remaining preset when reread settings have already shrunk', async () => {
  const systemPreset = createPreset({ id: 'preset-1', isSystemDefault: true });
  const userPreset = createPreset({ id: 'preset-2', isSystemDefault: false });
  const state = createSectionState(
    createSettings({
      borderPresets: [systemPreset, userPreset],
    })
  );
  trackPersistedSettings(
    createSettings({
      borderPresets: [userPreset],
      defaultBorderPresetId: 'preset-2',
    })
  );
  const crud = createHighlighterCrudActions(state);

  await crud.handleDeletePreset(userPreset);

  expect(saveHighlighterSettingsMock).not.toHaveBeenCalled();
  expect(toastErrorMock).toHaveBeenCalledWith('highlighter.section.lastPresetDeleteError');
});

it('logs reorder and patch failures without mutating local state', async () => {
  const firstPreset = createPreset({ id: 'preset-1', isSystemDefault: true, order: 0 });
  const secondPreset = createPreset({ id: 'preset-2', order: 1 });
  const state = createSectionState(
    createSettings({
      borderPresets: [firstPreset, secondPreset],
    })
  );
  trackPersistedSettings(state.settings!);
  const drag = createHighlighterDragActions(state);
  const settingsActions = createHighlighterSettingsActions(state);
  const dragEvent = createDragEvent();

  drag.handleDragStart(dragEvent, 'preset-1');
  saveHighlighterSettingsMock.mockRejectedValueOnce(new Error('reorder failed'));
  await drag.handleDrop(dragEvent, 'preset-2');

  expect(loggerErrorMock).toHaveBeenCalledWith(
    'Failed to reorder highlighter presets',
    expect.any(Error)
  );
  expect(toastErrorMock).toHaveBeenCalledWith(
    'common.states.errorhighlighter.section.reorderErrorSuffix'
  );
  expect(state.draggedId).toBeNull();
  expect(state.dragOverId).toBeNull();

  saveHighlighterSettingsMock.mockRejectedValueOnce(new Error('patch failed'));
  await settingsActions.handleUpdateBlurSettings({
    amount: 9,
    blurType: 'distortion',
    showBorder: false,
  });

  expect(loggerErrorMock).toHaveBeenCalledWith(
    'Failed to save highlighter settings patch',
    expect.any(Error)
  );
  expect(toastErrorMock).toHaveBeenCalledWith(
    'common.states.errorhighlighter.section.saveErrorSuffix'
  );
});
