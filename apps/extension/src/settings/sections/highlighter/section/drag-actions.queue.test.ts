// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import type { BorderPreset, HighlighterSettings } from '../../../../features/highlighter/contracts';

const { loadHighlighterSettingsMock, saveHighlighterSettingsMock } = vi.hoisted(() => ({
  loadHighlighterSettingsMock: vi.fn(),
  saveHighlighterSettingsMock: vi.fn(),
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
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

import { createHighlighterDragActions } from './drag-actions';
import { createHighlighterSettingsActions } from './persistence-actions';

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

function createDeferred() {
  let resolve: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });

  return {
    promise,
    resolve: resolve!,
  };
}

function createDragEvent() {
  return {
    dataTransfer: {
      effectAllowed: 'none',
    },
    preventDefault: vi.fn(),
  };
}

function createQueuedDragHarness() {
  const firstPreset = createPreset({ id: 'preset-1', isSystemDefault: true, order: 0 });
  const secondPreset = createPreset({ id: 'preset-2', order: 1 });
  const state = createSectionState(createSettings({ borderPresets: [firstPreset, secondPreset] }));

  return {
    dragActions: createHighlighterDragActions(state),
    dragEvent: createDragEvent(),
    settingsActions: createHighlighterSettingsActions(state),
    state,
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  loadHighlighterSettingsMock.mockReset();
  saveHighlighterSettingsMock.mockResolvedValue(undefined);
});

it('preserves the dragged preset id when the reorder waits behind another queued save', async () => {
  const { dragActions, dragEvent, settingsActions, state } = createQueuedDragHarness();
  let persistedSettings = state.settings!;
  const firstSave = createDeferred();
  const secondSave = createDeferred();

  loadHighlighterSettingsMock.mockImplementation(async () => persistedSettings);
  saveHighlighterSettingsMock
    .mockImplementationOnce(async (settings) => {
      await firstSave.promise;
      persistedSettings = settings;
    })
    .mockImplementationOnce(async (settings) => {
      await secondSave.promise;
      persistedSettings = settings;
    });

  const blurPromise = settingsActions.handleUpdateBlurSettings({
    amount: 7,
    blurType: 'solid',
    showBorder: true,
  });

  dragActions.handleDragStart(dragEvent, 'preset-1');
  dragActions.handleDragOver(dragEvent, 'preset-2');
  const dropPromise = dragActions.handleDrop(dragEvent, 'preset-2');
  dragActions.handleDragEnd();

  await flushMicrotasks();
  expect(saveHighlighterSettingsMock).toHaveBeenCalledTimes(1);

  firstSave.resolve();
  await blurPromise;
  await flushMicrotasks();

  expect(saveHighlighterSettingsMock).toHaveBeenCalledTimes(2);
  expect(saveHighlighterSettingsMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      borderPresets: [
        expect.objectContaining({ id: 'preset-2', order: 0 }),
        expect.objectContaining({ id: 'preset-1', order: 1 }),
      ],
    })
  );

  secondSave.resolve();
  await dropPromise;
});
