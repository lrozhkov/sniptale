// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HighlighterSettings } from '../../../../features/highlighter/contracts';
import { useHighlighterSectionState } from './state';

const { loadHighlighterSettingsMock, loggerErrorMock, toastErrorMock } = vi.hoisted(() => ({
  loadHighlighterSettingsMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock('../../../../composition/persistence/highlighter', async (importOriginal) => ({
  ...(await importOriginal()),
  HIGHLIGHTER_SETTINGS_KEY: 'sniptale_highlighter_settings',
  loadHighlighterSettings: loadHighlighterSettingsMock,
}));

vi.mock('../../../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    subscribeToChanges: vi.fn(() => () => undefined),
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

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useHighlighterSectionState> | null = null;

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

describe('useHighlighterSectionState loading', () => {
  it('loads highlighter settings into the section state', async () => {
    const settings = createSettings();
    loadHighlighterSettingsMock.mockResolvedValue(settings);

    await renderHarness();
    await flushEffects();

    expect(latestState?.isLoading).toBe(false);
    expect(latestState?.settings).toEqual(settings);
    expect(loggerErrorMock).not.toHaveBeenCalled();
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('surfaces loading failures through the logger and toast seams', async () => {
    loadHighlighterSettingsMock.mockRejectedValue(new Error('load failed'));

    await renderHarness();
    await flushEffects();

    expect(latestState?.isLoading).toBe(false);
    expect(latestState?.settings).toBeNull();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      'Failed to load highlighter settings',
      expect.any(Error)
    );
    expect(toastErrorMock).toHaveBeenCalledWith(
      'common.states.errorhighlighter.section.loadErrorSuffix'
    );
  });
});

describe('useHighlighterSectionState sync', () => {
  it('reloads highlighter settings when the shared settings-changed event fires', async () => {
    const initialSettings = createSettings();
    const updatedSettings = {
      ...createSettings(),
      defaultBorderPresetId: 'preset-2',
    };

    loadHighlighterSettingsMock
      .mockResolvedValueOnce(initialSettings)
      .mockResolvedValueOnce(updatedSettings);

    await renderHarness();
    await flushEffects();

    act(() => {
      window.dispatchEvent(new CustomEvent('sniptale-highlighter-settings-changed'));
    });
    await flushEffects();

    expect(loadHighlighterSettingsMock).toHaveBeenCalledTimes(2);
    expect(latestState?.settings).toEqual(updatedSettings);
  });
});
