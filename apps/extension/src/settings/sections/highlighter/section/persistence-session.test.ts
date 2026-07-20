// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

import type { BorderPreset, HighlighterSettings } from '../../../../features/highlighter/contracts';
import {
  createHighlighterSettingsPersistenceSession,
  reconcileCurrentHighlighterSettings,
  saveQueuedHighlighterSettings,
  syncHighlighterSettingsSnapshot,
  type HighlighterSettingsPersistenceSession,
} from './persistence';

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

function createSettings(overrides: Partial<HighlighterSettings> = {}): HighlighterSettings {
  return {
    borderPresets: overrides.borderPresets ?? [createPreset('preset-1')],
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
    settingsPersistenceSession,
    settings,
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

  return { promise, resolve: resolve! };
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

const loadSettingsMock = vi.fn<() => Promise<HighlighterSettings>>();
const persistSettingsMock = vi.fn<(settings: HighlighterSettings) => Promise<void>>();

beforeEach(() => {
  vi.clearAllMocks();
  loadSettingsMock.mockReset();
  persistSettingsMock.mockResolvedValue(undefined);
});

function prepareQueuedPersistenceState() {
  const state = createSectionState(
    createSettings({
      borderPresets: [createPreset('preset-1'), createPreset('preset-2')],
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

it('keeps queued saves on the same session when the state wrapper changes', async () => {
  const { firstSave, secondSave, state } = prepareQueuedPersistenceState();
  const wrappedState = createSectionState(state.settings, state.settingsPersistenceSession);

  const blurPromise = saveQueuedHighlighterSettings(
    state,
    (settings) => ({ ...settings, defaultBlurSettings: queuedBlurSettings }),
    persistSettingsMock,
    loadSettingsMock
  );
  const defaultPromise = saveQueuedHighlighterSettings(
    wrappedState,
    (settings) => ({ ...settings, defaultBorderPresetId: 'preset-2' }),
    persistSettingsMock,
    loadSettingsMock
  );
  await flushMicrotasks();

  expect(persistSettingsMock).toHaveBeenCalledTimes(1);

  firstSave.resolve();
  await blurPromise;
  await flushMicrotasks();

  expect(persistSettingsMock).toHaveBeenCalledTimes(2);

  secondSave.resolve();
  await defaultPromise;

  expect(wrappedState.settings).toEqual(
    expect.objectContaining({
      defaultBorderPresetId: 'preset-2',
      defaultBlurSettings: queuedBlurSettings,
    })
  );
});

it('does not block independent section sessions behind each other', async () => {
  const firstSave = createDeferred();
  const firstState = createSectionState(createSettings());
  const secondState = createSectionState(createSettings());

  loadSettingsMock.mockImplementation(async () => createSettings());
  persistSettingsMock
    .mockImplementationOnce(async () => firstSave.promise)
    .mockResolvedValue(undefined);

  const firstPromise = saveQueuedHighlighterSettings(
    firstState,
    (settings) => ({ ...settings, defaultBorderPresetId: 'preset-1' }),
    persistSettingsMock,
    loadSettingsMock
  );
  await flushMicrotasks();

  const secondPromise = saveQueuedHighlighterSettings(
    secondState,
    (settings) => ({ ...settings, defaultBorderPresetId: 'preset-2' }),
    persistSettingsMock,
    loadSettingsMock
  );
  await flushMicrotasks();

  expect(persistSettingsMock).toHaveBeenCalledTimes(2);

  firstSave.resolve();
  await Promise.all([firstPromise, secondPromise]);
});

it('reconciles snapshots by persistence session instead of setter identity', () => {
  const session = createHighlighterSettingsPersistenceSession();
  const currentSettings = createSettings({ defaultBorderPresetId: 'preset-1' });
  const syncedSettings = createSettings({ defaultBorderPresetId: 'preset-2' });
  const state = createSectionState(currentSettings, session);
  const wrappedState = createSectionState(state.settings, state.settingsPersistenceSession);

  syncHighlighterSettingsSnapshot(session, syncedSettings);

  expect(reconcileCurrentHighlighterSettings(wrappedState)).toEqual(syncedSettings);
});
