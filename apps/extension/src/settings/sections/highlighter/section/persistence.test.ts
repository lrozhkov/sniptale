// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import type { BorderPreset, HighlighterSettings } from '../../../../features/highlighter/contracts';

import {
  createHighlighterSettingsPersistenceSession,
  saveQueuedHighlighterSettings,
  type HighlighterSettingsPersistenceSession,
} from './persistence';

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

function createSectionState(
  settings: HighlighterSettings | null,
  settingsPersistenceSession: HighlighterSettingsPersistenceSession = createHighlighterSettingsPersistenceSession()
) {
  const state = {
    draggedId: null as string | null,
    dragOverId: null as string | null,
    editingPreset: undefined as BorderPreset | undefined,
    hoveredPresetId: null as string | null,
    isEditorOpen: false,
    isLoading: false,
    settingsPersistenceSession,
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

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

const queuedBlurSettings = {
  amount: 9,
  blurType: 'solid' as const,
  showBorder: true,
};

function expectQueuedSave(callIndex: number, defaultBorderPresetId: string) {
  expect(persistSettingsMock).toHaveBeenNthCalledWith(
    callIndex,
    expect.objectContaining({
      defaultBorderPresetId,
      defaultBlurSettings: queuedBlurSettings,
    })
  );
}

function expectQueuedState(state: ReturnType<typeof createSectionState>) {
  expect(state.settings).toEqual(
    expect.objectContaining({
      defaultBorderPresetId: 'preset-2',
      defaultBlurSettings: queuedBlurSettings,
    })
  );
}

const loadSettingsMock = vi.fn<() => Promise<HighlighterSettings>>();
const persistSettingsMock = vi.fn<(settings: HighlighterSettings) => Promise<void>>();

beforeEach(() => {
  vi.clearAllMocks();
  loadSettingsMock.mockReset();
  persistSettingsMock.mockResolvedValue(undefined);
});

function prepareQueuedPersistenceState() {
  const firstPreset = createPreset({ id: 'preset-1', isSystemDefault: true, order: 0 });
  const secondPreset = createPreset({ id: 'preset-2', order: 1 });
  const state = createSectionState(
    createSettings({
      borderPresets: [firstPreset, secondPreset],
    })
  );
  const firstSave = createDeferred();
  const secondSave = createDeferred();
  let persistedSettings = state.settings!;

  loadSettingsMock.mockImplementation(async () => persistedSettings);
  persistSettingsMock
    .mockImplementationOnce(async (settings) => {
      await firstSave.promise;
      persistedSettings = settings;
    })
    .mockImplementationOnce(async (settings) => {
      await secondSave.promise;
      persistedSettings = settings;
    });

  return { firstSave, secondSave, state };
}

it('serializes overlapping settings saves against the latest committed snapshot', async () => {
  const { firstSave, secondSave, state } = prepareQueuedPersistenceState();

  const blurPromise = saveQueuedHighlighterSettings(
    state,
    (settings) => ({
      ...settings,
      defaultBlurSettings: queuedBlurSettings,
    }),
    persistSettingsMock,
    loadSettingsMock
  );
  const defaultPromise = saveQueuedHighlighterSettings(
    state,
    (settings) => ({
      ...settings,
      defaultBorderPresetId: 'preset-2',
    }),
    persistSettingsMock,
    loadSettingsMock
  );
  await flushMicrotasks();

  expect(persistSettingsMock).toHaveBeenCalledTimes(1);
  expectQueuedSave(1, 'preset-1');

  firstSave.resolve();
  await blurPromise;
  await flushMicrotasks();

  expect(persistSettingsMock).toHaveBeenCalledTimes(2);
  expectQueuedSave(2, 'preset-2');

  secondSave.resolve();
  await defaultPromise;

  expectQueuedState(state);
});

it('syncs local state to the reread settings when a guarded update becomes invalid', async () => {
  const state = createSectionState(
    createSettings({
      borderPresets: [createPreset({ id: 'preset-1' }), createPreset({ id: 'preset-2' })],
    })
  );
  const rereadSettings = createSettings({
    borderPresets: [createPreset({ id: 'preset-1' })],
  });

  loadSettingsMock.mockResolvedValue(rereadSettings);

  const updated = await saveQueuedHighlighterSettings(
    state,
    (settings) =>
      settings.borderPresets.some((preset) => preset.id === 'preset-2') ? settings : null,
    persistSettingsMock,
    loadSettingsMock
  );

  expect(updated).toBeNull();
  expect(persistSettingsMock).not.toHaveBeenCalled();
  expect(state.settings).toEqual(rereadSettings);
});
