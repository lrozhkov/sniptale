// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HighlighterSettings } from '../../../../features/highlighter/contracts';

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  loadHighlighterSettings: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => loggerMocks,
}));

vi.mock('../../../../composition/persistence/highlighter', async () => {
  const actual = await vi.importActual<
    typeof import('../../../../composition/persistence/highlighter')
  >('../../../../composition/persistence/highlighter');

  return {
    ...actual,
    loadHighlighterSettings: storageMocks.loadHighlighterSettings,
  };
});

import { useFrameSettingsPopoverLoadEffect } from './lifecycle';

const DEFAULT_SETTINGS: HighlighterSettings = {
  borderPresets: [],
  defaultBlurSettings: { amount: 8, blurType: 'gaussian', showBorder: true },
  defaultBorderPresetId: 'preset-1',
  defaultEffectMode: 'border',
  defaultFocusSettings: { opacity: 0.5, showBorder: false },
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function Harness(props: { isOpen: boolean; tick: number }) {
  const blurSettingsRef = React.useRef<HighlighterSettings['defaultBlurSettings'] | undefined>(
    undefined
  );
  const focusSettingsRef = React.useRef<HighlighterSettings['defaultFocusSettings'] | undefined>(
    undefined
  );
  const localBlurSettingsDirtyRef = React.useRef(false);
  const localFocusSettingsDirtyRef = React.useRef(false);
  const [, setGlobalSettings] = React.useState<HighlighterSettings | null>(null);
  const [, setLocalBlurSettings] = React.useState(DEFAULT_SETTINGS.defaultBlurSettings);
  const [, setLocalFocusSettings] = React.useState(DEFAULT_SETTINGS.defaultFocusSettings);

  useFrameSettingsPopoverLoadEffect({
    blurSettingsRef,
    focusSettingsRef,
    isOpen: props.isOpen,
    localBlurSettingsDirtyRef,
    localFocusSettingsDirtyRef,
    setGlobalSettings,
    setLocalBlurSettings,
    setLocalFocusSettings,
  });

  return <div data-tick={String(props.tick)} />;
}

function renderHarness(isOpen: boolean, tick: number) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<Harness isOpen={isOpen} tick={tick} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  storageMocks.loadHighlighterSettings.mockReset();
  loggerMocks.error.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('useFrameSettingsPopoverLoadEffect', () => {
  it('loads persisted defaults once while the popover stays open across rerenders', async () => {
    storageMocks.loadHighlighterSettings.mockResolvedValue(DEFAULT_SETTINGS);

    renderHarness(true, 0);
    renderHarness(true, 1);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(storageMocks.loadHighlighterSettings).toHaveBeenCalledTimes(1);
  });

  it('logs loader failures without throwing through the popover lifecycle', async () => {
    const error = new Error('storage offline');
    storageMocks.loadHighlighterSettings.mockRejectedValue(error);

    renderHarness(true, 0);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Failed to load frame-settings popover defaults',
      error
    );
  });
});
