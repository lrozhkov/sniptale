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
  setDefaultBorderPreset: vi.fn(),
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

vi.mock('./state/highlighter-settings-mutation', () => ({
  requestDefaultBorderPresetMutation: storageMocks.setDefaultBorderPreset,
}));

import {
  createDefaultHighlighterSettings,
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_BORDER_PRESET,
} from '../../../features/highlighter/style/defaults';
import { getBorderPresetDisplayName } from '../../../features/highlighter/presets/display-name';
import { createBridgedMouseEvent } from '../../platform/trusted-events/synthetic-mouse';
import { FrameSettingsPopover } from '.';

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
  const {
    basedOnRevision: _basedOnRevision,
    customized: _customized,
    systemPresetKey: _systemPresetKey,
    ...basePreset
  } = DEFAULT_BORDER_PRESET;
  const persistedPreset = {
    ...basePreset,
    id: 'persisted-preset',
    name: 'Persisted preset',
    origin: 'user' as const,
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

function getPresetButton(name: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
    candidate.textContent?.includes(name)
  );

  if (!button) {
    throw new Error(`Expected frame settings preset button: ${name}`);
  }

  return button;
}

function setRangeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  act(() => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function renderPopover(overrides: Partial<React.ComponentProps<typeof FrameSettingsPopover>> = {}) {
  if (!anchorEl || !container) {
    throw new Error('Frame settings popover test scope is not initialized');
  }

  const props: React.ComponentProps<typeof FrameSettingsPopover> = {
    anchorEl,
    effectMode: 'border',
    frameId: 'frame-1',
    frameRect: { x: 100, y: 100, width: 180, height: 100 },
    isOpen: true,
    onApplyToFrame: vi.fn(),
    onClose: vi.fn(),
  };

  act(() => {
    root?.render(<FrameSettingsPopover {...{ ...props, ...overrides }} />);
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
  storageMocks.setDefaultBorderPreset.mockReset();
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

describe('FrameSettingsPopover loading state', () => {
  it('renders default settings while persisted settings are still loading', () => {
    storageMocks.loadHighlighterSettings.mockReturnValue(
      new Promise<HighlighterSettings>(() => undefined)
    );

    renderPopover();

    expect(document.querySelector('.sniptale-frame-settings-popover')).not.toBeNull();
    expect(document.body.textContent).toContain(getBorderPresetDisplayName(DEFAULT_BORDER_PRESET));
  });

  it('keeps the default settings surface visible when persisted settings loading fails', async () => {
    const error = new Error('storage offline');
    storageMocks.loadHighlighterSettings.mockRejectedValue(error);

    renderPopover();
    await flushAsyncEffects();

    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Failed to load frame-settings popover defaults',
      error
    );
    expect(document.querySelector('.sniptale-frame-settings-popover')).not.toBeNull();
  });

  it('updates the visible preset list when persisted settings load', async () => {
    storageMocks.loadHighlighterSettings.mockResolvedValue(createPersistedSettings());

    renderPopover();
    await flushAsyncEffects();

    expect(document.body.textContent).toContain('Persisted preset');
  });

  it('keeps the portal shell metadata and host-event isolation on one public surface', () => {
    storageMocks.loadHighlighterSettings.mockReturnValue(
      new Promise<HighlighterSettings>(() => undefined)
    );
    anchorEl?.setAttribute('data-theme', 'dark');
    const hostClick = vi.fn();
    document.body.addEventListener('click', hostClick);

    renderPopover();

    const popover = document.querySelector<HTMLElement>('.sniptale-frame-settings-popover');
    expect(popover?.classList).toContain('sniptale-glass-popover');
    expect(popover?.classList).toContain('sniptale-content-popover');
    expect(popover?.dataset['frameId']).toBe('frame-1');
    expect(popover?.dataset['theme']).toBe('dark');
    expect(popover?.querySelector('.sniptale-content-popover-body')).not.toBeNull();
    popover?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(hostClick).not.toHaveBeenCalled();

    document.body.removeEventListener('click', hostClick);
  });

  it('keeps the portal detached while the popover is closed', () => {
    storageMocks.loadHighlighterSettings.mockResolvedValue(createPersistedSettings());

    renderPopover({ isOpen: false });

    expect(document.querySelector('.sniptale-frame-settings-popover')).toBeNull();
  });
});

describe('FrameSettingsPopover pending blur edits', () => {
  it('keeps a local blur edit when persisted defaults resolve later', async () => {
    const deferredSettings = createDeferred<HighlighterSettings>();
    const onApplyToFrame = vi.fn();
    storageMocks.loadHighlighterSettings.mockReturnValue(deferredSettings.promise);

    renderPopover({ effectMode: 'blur', onApplyToFrame });
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

describe('FrameSettingsPopover pending focus edits', () => {
  it('keeps a local focus edit when persisted defaults resolve later', async () => {
    const deferredSettings = createDeferred<HighlighterSettings>();
    const onApplyToFrame = vi.fn();
    storageMocks.loadHighlighterSettings.mockReturnValue(deferredSettings.promise);

    renderPopover({ effectMode: 'focus', onApplyToFrame });
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

describe('FrameSettingsPopover preset close ordering', () => {
  it('closes after the selected preset persistence attempt completes', async () => {
    const deferredPersistence = createDeferred<void>();
    const onApplyToFrame = vi.fn();
    const onClose = vi.fn();
    storageMocks.loadHighlighterSettings.mockReturnValue(
      new Promise<HighlighterSettings>(() => undefined)
    );
    storageMocks.setDefaultBorderPreset.mockReturnValue(deferredPersistence.promise);

    renderPopover({ onApplyToFrame, onClose });

    act(() => {
      getPresetButton(getBorderPresetDisplayName(DEFAULT_BORDER_PRESET)).click();
    });

    expect(onApplyToFrame).not.toHaveBeenCalled();
    expect(storageMocks.setDefaultBorderPreset).not.toHaveBeenCalled();

    act(() => {
      getPresetButton(getBorderPresetDisplayName(DEFAULT_BORDER_PRESET)).dispatchEvent(
        createBridgedMouseEvent('click', {
          button: 0,
          buttons: 1,
          clientX: 20,
          clientY: 30,
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
        })
      );
    });

    expect(onApplyToFrame).toHaveBeenCalledWith({
      borderSettings: { ...DEFAULT_BORDER_PRESET },
    });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      deferredPersistence.resolve(undefined);
      await deferredPersistence.promise;
      await Promise.resolve();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the popover open when authoritative preset persistence is rejected', async () => {
    const persistenceError = new Error('rejected preset target');
    const onApplyToFrame = vi.fn();
    const onClose = vi.fn();
    storageMocks.loadHighlighterSettings.mockReturnValue(
      new Promise<HighlighterSettings>(() => undefined)
    );
    storageMocks.setDefaultBorderPreset.mockRejectedValue(persistenceError);

    renderPopover({ onApplyToFrame, onClose });

    act(() => {
      getPresetButton(getBorderPresetDisplayName(DEFAULT_BORDER_PRESET)).dispatchEvent(
        createBridgedMouseEvent('click', {
          button: 0,
          buttons: 1,
          clientX: 20,
          clientY: 30,
          ctrlKey: false,
          metaKey: false,
          shiftKey: false,
        })
      );
    });
    await flushAsyncEffects();

    expect(onApplyToFrame).toHaveBeenCalledWith({
      borderSettings: { ...DEFAULT_BORDER_PRESET },
    });
    expect(loggerMocks.error).toHaveBeenCalledWith(
      'Failed to save default preset',
      persistenceError
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
