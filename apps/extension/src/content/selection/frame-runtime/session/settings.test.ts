// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BlurSettings,
  EffectMode,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { cloneBorderPreset } from '../../../../features/highlighter/presets/catalog';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import {
  getFrameSessionBorderPreset,
  resetFrameSessionBorderPreset,
  setFrameSessionBorderPreset,
} from './border-preset';

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

const settingsMocks = vi.hoisted(() => ({
  loadHighlighterSettings: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal()),
  createLogger: () => loggerMocks,
}));

vi.mock('../../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/highlighter')>()),
  loadHighlighterSettings: settingsMocks.loadHighlighterSettings,
}));

import {
  combineFrameSessionSyncCleanups,
  createFrameSessionSettingsLoader,
  createFrameSessionStorageChangedHandler,
} from './settings';

const DEFAULT_SETTINGS: HighlighterSettings = {
  borderPresets: [],
  defaultBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
  defaultBorderPresetId: 'preset-1',
  defaultEffectMode: 'border',
  systemPresetCatalogRevision: 1,
  defaultFocusSettings: { opacity: 0.5, showBorder: false },
};

function createSettingsRefs() {
  const blur: BlurSettings = { amount: 1, blurType: 'distortion', showBorder: false };
  const focus: FocusSettings = { opacity: 0.2, showBorder: true };

  return {
    globalEffectModeRef: { current: 'blur' as EffectMode },
    highlighterSettingsCacheRef: { current: null as HighlighterSettings | null },
    sessionBlurSettingsRef: { current: blur },
    sessionDefaultsInitializedRef: { current: false },
    sessionFocusSettingsRef: { current: focus },
  };
}

beforeEach(() => {
  settingsMocks.loadHighlighterSettings.mockReset();
  loggerMocks.error.mockReset();
  resetFrameSessionBorderPreset();
});

describe('frame-session-sync-settings', () => {
  it(
    'loads settings into refs and normalizes the default effect mode fallback',
    expectSettingsLoaderUpdatesRefs
  );

  it('logs loader failures and only reacts to sync storage changes for highlighter settings', async () => {
    const refs = createSettingsRefs();
    const error = new Error('boom');
    settingsMocks.loadHighlighterSettings.mockRejectedValue(error);

    const loadSettings = createFrameSessionSettingsLoader(refs);
    loadSettings();
    await Promise.resolve();
    await Promise.resolve();

    expect(loggerMocks.error).toHaveBeenCalledWith('Failed to load highlighter settings', error);

    const handleStorageChanged = createFrameSessionStorageChangedHandler(loadSettings);
    handleStorageChanged({}, 'sync');
    handleStorageChanged(
      {
        sniptale_highlighter_settings: {
          newValue: {},
          oldValue: null,
        },
      },
      'local'
    );
    handleStorageChanged(
      {
        sniptale_highlighter_settings: {
          newValue: {},
          oldValue: null,
        },
      },
      'sync'
    );

    expect(settingsMocks.loadHighlighterSettings).toHaveBeenCalledTimes(2);
  });

  it('keeps current-tab choices while a new tab initializes from the latest persisted defaults', async () => {
    const firstPreset = {
      ...cloneBorderPreset(DEFAULT_BORDER_PRESET),
      id: 'first-default',
      name: 'First default',
    };
    const latestPreset = {
      ...cloneBorderPreset(DEFAULT_BORDER_PRESET),
      id: 'latest-default',
      name: 'Latest default',
    };
    const currentTabPreset = {
      ...cloneBorderPreset(DEFAULT_BORDER_PRESET),
      id: 'current-tab-choice',
      name: 'Current tab choice',
    };
    const firstDefaults: HighlighterSettings = {
      ...DEFAULT_SETTINGS,
      borderPresets: [firstPreset],
      defaultBorderPresetId: firstPreset.id,
      defaultEffectMode: 'border',
      defaultBlurSettings: { amount: 6, blurType: 'gaussian', showBorder: false },
      defaultFocusSettings: { opacity: 0.4, showBorder: false },
    };
    const latestDefaults: HighlighterSettings = {
      ...DEFAULT_SETTINGS,
      borderPresets: [latestPreset],
      defaultBorderPresetId: latestPreset.id,
      defaultEffectMode: 'focus',
      defaultBlurSettings: { amount: 24, blurType: 'pixelate', showBorder: true },
      defaultFocusSettings: { opacity: 0.8, showBorder: true },
    };
    settingsMocks.loadHighlighterSettings
      .mockResolvedValueOnce(firstDefaults)
      .mockResolvedValueOnce(latestDefaults)
      .mockResolvedValueOnce(latestDefaults);
    const currentTab = createSettingsRefs();
    const loadCurrentTab = createFrameSessionSettingsLoader(currentTab);

    loadCurrentTab();
    await Promise.resolve();
    currentTab.globalEffectModeRef.current = 'blur';
    setFrameSessionBorderPreset(currentTabPreset);
    currentTab.sessionBlurSettingsRef.current = {
      amount: 13,
      blurType: 'solid',
      showBorder: false,
    };
    currentTab.sessionFocusSettingsRef.current = { opacity: 0.25, showBorder: false };
    currentTab.sessionDefaultsInitializedRef.current = true;
    loadCurrentTab();
    await Promise.resolve();

    expect(currentTab.globalEffectModeRef.current).toBe('blur');
    expect(getFrameSessionBorderPreset()).toEqual(
      projectBorderPresetToAppliedSettings(currentTabPreset)
    );
    expect(currentTab.sessionBlurSettingsRef.current).toEqual({
      amount: 13,
      blurType: 'solid',
      showBorder: false,
    });
    expect(currentTab.sessionFocusSettingsRef.current).toEqual({
      opacity: 0.25,
      showBorder: false,
    });
    expect(currentTab.highlighterSettingsCacheRef.current).toEqual(latestDefaults);

    resetFrameSessionBorderPreset();
    const newTab = createSettingsRefs();
    createFrameSessionSettingsLoader(newTab)();
    await Promise.resolve();

    expect(newTab.globalEffectModeRef.current).toBe('focus');
    expect(getFrameSessionBorderPreset()).toEqual(
      projectBorderPresetToAppliedSettings(latestPreset)
    );
    expect(getFrameSessionBorderPreset()).not.toBe(latestPreset);
    expect(newTab.sessionBlurSettingsRef.current).toEqual(latestDefaults.defaultBlurSettings);
    expect(newTab.sessionFocusSettingsRef.current).toEqual(latestDefaults.defaultFocusSettings);
  });

  it('discards an older settings load that resolves after the latest request', async () => {
    const older = createDeferred<HighlighterSettings>();
    const latest = createDeferred<HighlighterSettings>();
    const latestPreset = {
      ...cloneBorderPreset(DEFAULT_BORDER_PRESET),
      id: 'latest-race-winner',
      name: 'Latest race winner',
    };
    const latestSettings = {
      ...DEFAULT_SETTINGS,
      borderPresets: [latestPreset],
      defaultBorderPresetId: latestPreset.id,
      defaultEffectMode: 'focus' as const,
    };
    settingsMocks.loadHighlighterSettings
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(latest.promise);
    const refs = createSettingsRefs();
    const loadSettings = createFrameSessionSettingsLoader(refs);

    loadSettings();
    loadSettings();
    latest.resolve(latestSettings);
    await latest.promise;
    await Promise.resolve();
    older.resolve({ ...DEFAULT_SETTINGS, defaultEffectMode: 'blur' });
    await older.promise;
    await Promise.resolve();

    expect(refs.highlighterSettingsCacheRef.current).toEqual(latestSettings);
    expect(refs.globalEffectModeRef.current).toBe('focus');
    expect(getFrameSessionBorderPreset()).toEqual(
      projectBorderPresetToAppliedSettings(latestPreset)
    );
  });

  it('initializes the border default after a non-border choice wins during the initial load', async () => {
    const pending = createDeferred<HighlighterSettings>();
    const persistedPreset = {
      ...cloneBorderPreset(DEFAULT_BORDER_PRESET),
      id: 'persisted-border-after-effect-choice',
      name: 'Persisted border after effect choice',
    };
    settingsMocks.loadHighlighterSettings.mockReturnValue(pending.promise);
    const refs = createSettingsRefs();
    const loadSettings = createFrameSessionSettingsLoader(refs);

    loadSettings();
    refs.globalEffectModeRef.current = 'focus';
    refs.sessionBlurSettingsRef.current = {
      amount: 19,
      blurType: 'solid',
      showBorder: false,
    };
    refs.sessionFocusSettingsRef.current = { opacity: 0.35, showBorder: true };
    refs.sessionDefaultsInitializedRef.current = true;
    pending.resolve({
      ...DEFAULT_SETTINGS,
      borderPresets: [persistedPreset],
      defaultBorderPresetId: persistedPreset.id,
    });
    await pending.promise;
    await Promise.resolve();

    expect(getFrameSessionBorderPreset()).toEqual(
      projectBorderPresetToAppliedSettings(persistedPreset)
    );
    expect(refs.globalEffectModeRef.current).toBe('focus');
    expect(refs.sessionBlurSettingsRef.current).toEqual({
      amount: 19,
      blurType: 'solid',
      showBorder: false,
    });
    expect(refs.sessionFocusSettingsRef.current).toEqual({ opacity: 0.35, showBorder: true });
  });

  it('keeps an explicit border choice made before the initial settings load resolves', async () => {
    const pending = createDeferred<HighlighterSettings>();
    const persistedPreset = {
      ...cloneBorderPreset(DEFAULT_BORDER_PRESET),
      id: 'persisted-border-loser',
      name: 'Persisted border loser',
    };
    const explicitPreset = {
      ...cloneBorderPreset(DEFAULT_BORDER_PRESET),
      id: 'explicit-border-winner',
      name: 'Explicit border winner',
    };
    settingsMocks.loadHighlighterSettings.mockReturnValue(pending.promise);
    const refs = createSettingsRefs();
    const loadSettings = createFrameSessionSettingsLoader(refs);

    loadSettings();
    setFrameSessionBorderPreset(explicitPreset);
    pending.resolve({
      ...DEFAULT_SETTINGS,
      borderPresets: [persistedPreset],
      defaultBorderPresetId: persistedPreset.id,
    });
    await pending.promise;
    await Promise.resolve();

    expect(getFrameSessionBorderPreset()).toEqual(
      projectBorderPresetToAppliedSettings(explicitPreset)
    );
  });
});

describe('frame-session-sync-settings cleanup', () => {
  it('runs both cleanup callbacks through the combined cleanup helper', () => {
    const cleanupWindowListeners = vi.fn();
    const cleanupStorageListener = vi.fn();

    combineFrameSessionSyncCleanups({
      cleanupStorageListener,
      cleanupWindowListeners,
    })();

    expect(cleanupWindowListeners).toHaveBeenCalledTimes(1);
    expect(cleanupStorageListener).toHaveBeenCalledTimes(1);
  });
});

async function expectSettingsLoaderUpdatesRefs() {
  const refs = createSettingsRefs();
  settingsMocks.loadHighlighterSettings.mockResolvedValue({
    ...DEFAULT_SETTINGS,
    defaultEffectMode: undefined,
  });

  const loadSettings = createFrameSessionSettingsLoader(refs);
  loadSettings();
  await Promise.resolve();

  expectLoaderRefUpdates(refs);
}

function expectLoaderRefUpdates(refs: ReturnType<typeof createSettingsRefs>) {
  expect(refs.highlighterSettingsCacheRef.current).toEqual({
    ...DEFAULT_SETTINGS,
    defaultEffectMode: undefined,
  });
  expect(refs.globalEffectModeRef.current).toBe('border');
  expect(getFrameSessionBorderPreset()).toEqual(
    projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET)
  );
  expect(refs.sessionBlurSettingsRef.current).toEqual(DEFAULT_SETTINGS.defaultBlurSettings);
  expect(refs.sessionFocusSettingsRef.current).toEqual(DEFAULT_SETTINGS.defaultFocusSettings);
}

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value: T) => {
      if (!resolvePromise) {
        throw new Error('Deferred promise resolve callback is unavailable');
      }
      resolvePromise(value);
    },
  };
}
