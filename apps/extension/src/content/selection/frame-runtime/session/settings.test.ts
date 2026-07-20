// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BlurSettings,
  FocusSettings,
  HighlighterSettings,
} from '../../../../features/highlighter/contracts';

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
  defaultFocusSettings: { opacity: 0.5, showBorder: false },
};

function createSettingsRefs() {
  const blur: BlurSettings = { amount: 1, blurType: 'distortion', showBorder: false };
  const focus: FocusSettings = { opacity: 0.2, showBorder: true };

  return {
    globalEffectModeRef: { current: 'blur' as const },
    highlighterSettingsCacheRef: { current: null as HighlighterSettings | null },
    sessionBlurSettingsRef: { current: blur },
    sessionFocusSettingsRef: { current: focus },
  };
}

beforeEach(() => {
  settingsMocks.loadHighlighterSettings.mockReset();
  loggerMocks.error.mockReset();
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
  expect(refs.sessionBlurSettingsRef.current).toEqual(DEFAULT_SETTINGS.defaultBlurSettings);
  expect(refs.sessionFocusSettingsRef.current).toEqual(DEFAULT_SETTINGS.defaultFocusSettings);
}
