// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HighlighterSettings } from '../../../../features/highlighter/contracts';
import { useHighlighterSectionState } from './state';

const { loadHighlighterSettingsMock, loggerErrorMock, subscribeToChangesMock, toastErrorMock } =
  vi.hoisted(() => ({
    loadHighlighterSettingsMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    subscribeToChangesMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }));

vi.mock('../../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal()),
  HIGHLIGHTER_SETTINGS_KEY: 'sniptale_highlighter_settings',
  loadHighlighterSettings: loadHighlighterSettingsMock,
}));

vi.mock('../../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    subscribeToChanges: subscribeToChangesMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal()),
  toast: {
    error: toastErrorMock,
  },
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

type StorageChangeListener = (
  changes: Record<string, { newValue?: unknown }>,
  areaName: chrome.storage.AreaName
) => void;

let container: HTMLDivElement | null = null;
let latestState: ReturnType<typeof useHighlighterSectionState> | null = null;
let root: Root | null = null;

function createDeferred<T>() {
  let resolvePromise: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise! };
}

function createSettings(): HighlighterSettings {
  return {
    borderPresets: [
      {
        id: 'preset-1',
        name: 'Default',
        isSystemDefault: true,
        order: 0,
        width: 2,
        color: '#ff0000',
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
      },
    ],
    defaultBorderPresetId: 'preset-1',
    defaultEffectMode: 'border',
    defaultBlurSettings: {
      amount: 4,
      blurType: 'gaussian',
      showBorder: false,
    },
    defaultFocusSettings: {
      opacity: 0.4,
      showBorder: true,
    },
  };
}

function HighlighterStateHarness() {
  latestState = useHighlighterSectionState();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HighlighterStateHarness />);
  });
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  loadHighlighterSettingsMock.mockReset();
  loggerErrorMock.mockReset();
  subscribeToChangesMock.mockReset();
  subscribeToChangesMock.mockReturnValue(() => undefined);
  toastErrorMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useHighlighterSectionState storage sync reloads', () => {
  it('reloads highlighter settings when sync storage reports a highlighter settings change', async () => {
    let storageChangeListener: StorageChangeListener | null = null;
    const initialSettings = createSettings();
    const updatedSettings = { ...createSettings(), defaultBorderPresetId: 'preset-2' };

    subscribeToChangesMock.mockImplementation((listener: StorageChangeListener) => {
      storageChangeListener = listener;
      return () => undefined;
    });
    loadHighlighterSettingsMock
      .mockResolvedValueOnce(initialSettings)
      .mockResolvedValueOnce(updatedSettings);

    await renderHarness();
    await flushEffects();

    expect(subscribeToChangesMock).toHaveBeenCalledTimes(1);

    act(() => {
      storageChangeListener?.(
        {
          sniptale_highlighter_settings: { newValue: updatedSettings },
        },
        'sync'
      );
    });
    await flushEffects();

    expect(loadHighlighterSettingsMock).toHaveBeenCalledTimes(2);
    expect(latestState?.settings).toEqual(updatedSettings);
  });
});

describe('useHighlighterSectionState storage sync loading handoff', () => {
  it('clears loading when a storage refresh wins before the initial load settles', async () => {
    let storageChangeListener: StorageChangeListener | null = null;
    const initialLoad = createDeferred<HighlighterSettings>();
    const refreshedSettings = { ...createSettings(), defaultBorderPresetId: 'preset-2' };

    subscribeToChangesMock.mockImplementation((listener: StorageChangeListener) => {
      storageChangeListener = listener;
      return () => undefined;
    });
    loadHighlighterSettingsMock
      .mockReturnValueOnce(initialLoad.promise)
      .mockResolvedValueOnce(refreshedSettings);

    await renderHarness();

    act(() => {
      storageChangeListener?.(
        {
          sniptale_highlighter_settings: { newValue: refreshedSettings },
        },
        'sync'
      );
    });
    await flushEffects();

    expect(latestState?.settings).toEqual(refreshedSettings);
    expect(latestState?.isLoading).toBe(false);

    initialLoad.resolve(createSettings());
    await flushEffects();

    expect(latestState?.settings).toEqual(refreshedSettings);
    expect(latestState?.isLoading).toBe(false);
  });
});

describe('useHighlighterSectionState storage sync ordering', () => {
  it('keeps the newest storage refresh when overlapping sync requests resolve out of order', async () => {
    let storageChangeListener: StorageChangeListener | null = null;
    const initialSettings = createSettings();
    const staleRefresh = createDeferred<HighlighterSettings>();
    const latestSettings = {
      ...createSettings(),
      defaultBorderPresetId: 'preset-2',
    };
    const latestRefresh = createDeferred<HighlighterSettings>();

    subscribeToChangesMock.mockImplementation((listener: StorageChangeListener) => {
      storageChangeListener = listener;
      return () => undefined;
    });
    loadHighlighterSettingsMock
      .mockResolvedValueOnce(initialSettings)
      .mockReturnValueOnce(staleRefresh.promise)
      .mockReturnValueOnce(latestRefresh.promise);

    await renderHarness();
    await flushEffects();

    act(() => {
      storageChangeListener?.(
        {
          sniptale_highlighter_settings: { newValue: latestSettings },
        },
        'sync'
      );
      window.dispatchEvent(new CustomEvent('sniptale-highlighter-settings-changed'));
    });
    await flushEffects();

    latestRefresh.resolve(latestSettings);
    await flushEffects();

    expect(latestState?.settings).toEqual(latestSettings);

    staleRefresh.resolve({
      ...createSettings(),
      defaultBorderPresetId: 'stale-preset',
    });
    await flushEffects();

    expect(latestState?.settings).toEqual(latestSettings);
  });
});

describe('useHighlighterSectionState storage sync failures', () => {
  it('logs post-initial sync refresh failures without replacing the current settings', async () => {
    let storageChangeListener: StorageChangeListener | null = null;
    const initialSettings = createSettings();

    subscribeToChangesMock.mockImplementation((listener: StorageChangeListener) => {
      storageChangeListener = listener;
      return () => undefined;
    });
    loadHighlighterSettingsMock
      .mockResolvedValueOnce(initialSettings)
      .mockRejectedValueOnce(new Error('sync failed'));

    await renderHarness();
    await flushEffects();

    act(() => {
      storageChangeListener?.(
        {
          sniptale_highlighter_settings: { newValue: createSettings() },
        },
        'sync'
      );
    });
    await flushEffects();

    expect(latestState?.settings).toEqual(initialSettings);
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to synchronize highlighter settings',
      expect.any(Error)
    );
    expect(toastErrorMock).not.toHaveBeenCalled();
  });
});
