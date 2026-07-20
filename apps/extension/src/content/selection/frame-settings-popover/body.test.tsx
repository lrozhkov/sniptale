// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HighlighterSettings } from '../../../features/highlighter/contracts';

const loggerMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  loadHighlighterSettings: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => loggerMocks,
}));

vi.mock('../../../composition/persistence/highlighter', async () => {
  const actual = await vi.importActual<
    typeof import('../../../composition/persistence/highlighter')
  >('../../../composition/persistence/highlighter');

  return {
    ...actual,
    loadHighlighterSettings: storageMocks.loadHighlighterSettings,
  };
});

import {
  createDefaultHighlighterSettings,
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_BORDER_PRESET,
} from '../../../features/highlighter/style/defaults';
import { FrameSettingsPopoverBody } from './body';

let anchorEl: HTMLButtonElement | null = null;
let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | null = null;
  let rejectPromise: ((reason?: unknown) => void) | null = null;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: (reason?: unknown) => {
      if (!rejectPromise) {
        throw new Error('Deferred promise reject callback is unavailable');
      }

      rejectPromise(reason);
    },
    resolve: (value: T) => {
      if (!resolvePromise) {
        throw new Error('Deferred promise resolve callback is unavailable');
      }

      resolvePromise(value);
    },
  };
}

function createPersistedSettings(
  overrides: Partial<HighlighterSettings> = {}
): HighlighterSettings {
  const persistedPreset = {
    ...DEFAULT_BORDER_PRESET,
    id: 'persisted-preset',
    name: 'Persisted preset',
  };

  return {
    ...createDefaultHighlighterSettings(),
    borderPresets: [persistedPreset],
    defaultBorderPresetId: persistedPreset.id,
    ...overrides,
  };
}

function getRangeInput() {
  const input = document.querySelector<HTMLInputElement>('input[type="range"]');

  if (!input) {
    throw new Error('Expected frame settings range input to be rendered');
  }

  return input;
}

function setRangeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  act(() => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function renderBody(
  overrides: Partial<React.ComponentProps<typeof FrameSettingsPopoverBody>> = {}
) {
  if (!anchorEl || !container) {
    throw new Error('Frame settings popover test scope is not initialized');
  }

  const props: React.ComponentProps<typeof FrameSettingsPopoverBody> = {
    anchorEl,
    effectMode: 'border',
    frameId: 'frame-1',
    isOpen: true,
    onApplyToFrame: vi.fn(),
    onClose: vi.fn(),
  };

  act(() => {
    root?.render(<FrameSettingsPopoverBody {...{ ...props, ...overrides }} />);
  });
}

async function flushAsyncEffects() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  storageMocks.loadHighlighterSettings.mockReset();
  loggerMocks.error.mockReset();

  anchorEl = document.createElement('button');
  anchorEl.getBoundingClientRect = () =>
    ({
      bottom: 80,
      height: 40,
      left: 40,
      right: 120,
      top: 40,
      width: 80,
      x: 40,
      y: 40,
    }) as DOMRect;
  container = document.createElement('div');
  document.body.append(container, anchorEl);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  anchorEl?.remove();
  container = null;
  anchorEl = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FrameSettingsPopoverBody loading state', () => {
  it('renders default settings while persisted settings are still loading', () => {
    storageMocks.loadHighlighterSettings.mockReturnValue(
      new Promise<HighlighterSettings>(() => undefined)
    );

    renderBody();

    expect(document.querySelector('.sniptale-frame-settings-popover')).not.toBeNull();
    expect(document.body.textContent).toContain(DEFAULT_BORDER_PRESET.name);
  });

  it('keeps the default settings surface visible when persisted settings loading fails', async () => {
    const error = new Error('storage offline');
    storageMocks.loadHighlighterSettings.mockRejectedValue(error);

    renderBody();
    await flushAsyncEffects();

    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Failed to load frame-settings popover defaults',
      error
    );
    expect(document.querySelector('.sniptale-frame-settings-popover')).not.toBeNull();
  });

  it('updates the visible preset list when persisted settings load', async () => {
    storageMocks.loadHighlighterSettings.mockResolvedValue(createPersistedSettings());

    renderBody();
    await flushAsyncEffects();

    expect(document.body.textContent).toContain('Persisted preset');
  });
});

describe('FrameSettingsPopoverBody pending blur edits', () => {
  it('keeps a local blur edit when persisted defaults resolve later', async () => {
    const deferredSettings = createDeferred<HighlighterSettings>();
    const onApplyToFrame = vi.fn();
    storageMocks.loadHighlighterSettings.mockReturnValue(deferredSettings.promise);

    renderBody({ effectMode: 'blur', onApplyToFrame });
    setRangeInputValue(getRangeInput(), '7');

    expect(onApplyToFrame).toHaveBeenLastCalledWith({
      blurSettings: { ...DEFAULT_BLUR_SETTINGS, amount: 7 },
    });

    await act(async () => {
      deferredSettings.resolve(
        createPersistedSettings({
          defaultBlurSettings: { ...DEFAULT_BLUR_SETTINGS, amount: 22 },
        })
      );
      await deferredSettings.promise;
      await Promise.resolve();
    });

    expect(getRangeInput().value).toBe('7');
  });
});

describe('FrameSettingsPopoverBody pending focus edits', () => {
  it('keeps a local focus edit when persisted defaults resolve later', async () => {
    const deferredSettings = createDeferred<HighlighterSettings>();
    const onApplyToFrame = vi.fn();
    storageMocks.loadHighlighterSettings.mockReturnValue(deferredSettings.promise);

    renderBody({ effectMode: 'focus', onApplyToFrame });
    setRangeInputValue(getRangeInput(), '30');

    expect(onApplyToFrame).toHaveBeenLastCalledWith({
      focusSettings: { opacity: 0.3, showBorder: false },
    });

    await act(async () => {
      deferredSettings.resolve(
        createPersistedSettings({
          defaultFocusSettings: { opacity: 0.9, showBorder: true },
        })
      );
      await deferredSettings.promise;
      await Promise.resolve();
    });

    expect(getRangeInput().value).toBe('30');
  });
});
