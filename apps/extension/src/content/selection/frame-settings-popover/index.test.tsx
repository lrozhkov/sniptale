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
  addBorderPresetWithOutcome: vi.fn(),
  loadHighlighterSettings: vi.fn(),
  setBorderPresetEnabled: vi.fn(),
  updateBorderPresetWithOutcome: vi.fn(),
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
    addBorderPresetWithOutcome: storageMocks.addBorderPresetWithOutcome,
    loadHighlighterSettings: storageMocks.loadHighlighterSettings,
    setBorderPresetEnabled: storageMocks.setBorderPresetEnabled,
    updateBorderPresetWithOutcome: storageMocks.updateBorderPresetWithOutcome,
  };
});

import {
  createDefaultHighlighterSettings,
  DEFAULT_BLUR_SETTINGS,
  DEFAULT_BORDER_PRESET,
  DEFAULT_FOCUS_SETTINGS,
} from '../../../features/highlighter/style/defaults';
import { getBorderPresetDisplayName } from '../../../features/highlighter/presets/display-name';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { translate } from '../../../platform/i18n';
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

function getPresetRow(name: string) {
  const row = [...document.querySelectorAll<HTMLElement>('.sniptale-frame-style-preset-row')].find(
    (candidate) => candidate.textContent?.includes(name)
  );

  if (!row) {
    throw new Error(`Expected frame style preset row: ${name}`);
  }

  return row;
}

function clickTrusted(element: HTMLElement) {
  act(() => {
    element.dispatchEvent(
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
  storageMocks.addBorderPresetWithOutcome.mockReset();
  storageMocks.setBorderPresetEnabled.mockReset();
  storageMocks.updateBorderPresetWithOutcome.mockReset();
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

    const popover = document.querySelector<HTMLElement>(
      '.sniptale-frame-settings-popover[data-frame-id="frame-1"]'
    );
    expect(popover?.classList).toContain('sniptale-glass-popover');
    expect(popover?.classList).toContain('sniptale-content-popover');
    expect(popover?.classList).toContain('sniptale-content-popover--toolbar-menu');
    expect(popover?.dataset['frameId']).toBe('frame-1');
    expect(popover?.dataset['theme']).toBe('dark');
    expect(popover?.dataset['sniptaleActivationBridge']).toBe('defer');
    expect(popover?.style.width).toBe('400px');
    expect(
      popover?.querySelector('.sniptale-settings-popover-header')?.getAttribute('data-draggable')
    ).toBe('true');
    expect(popover?.querySelector('.sniptale-settings-popover-close')).not.toBeNull();
    expect(document.querySelector('.sniptale-frame-style-editor-layer')).toBeNull();
    expect(popover?.querySelector('.sniptale-content-popover-body')).not.toBeNull();
    popover?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(hostClick).not.toHaveBeenCalled();
    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 80,
    });
    popover?.dispatchEvent(wheelEvent);
    expect(wheelEvent.defaultPrevented).toBe(true);

    document.body.removeEventListener('click', hostClick);
  });

  it('keeps the main-toolbar surface transient and its header static', () => {
    storageMocks.loadHighlighterSettings.mockReturnValue(
      new Promise<HighlighterSettings>(() => undefined)
    );

    renderPopover({ scope: 'session' });

    const popover = document.querySelector<HTMLElement>('.sniptale-frame-settings-popover');
    const header = popover?.querySelector('.sniptale-settings-popover-header');
    expect(popover?.style.width).toBe('400px');
    expect(popover?.classList.contains('sniptale-main-toolbar-popover')).toBe(true);
    expect(header?.hasAttribute('data-draggable')).toBe(false);
    expect(popover?.querySelector('.sniptale-settings-popover-close')).toBeNull();
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
      focusSettings: { blurAmount: 0, opacity: 0.3, showBorder: true },
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

describe('FrameSettingsPopover preset selection', () => {
  it('closes on a trusted repeat selection without reapplying the active preset', () => {
    const onApplyToFrame = vi.fn();
    const onClose = vi.fn();
    storageMocks.loadHighlighterSettings.mockReturnValue(
      new Promise<HighlighterSettings>(() => undefined)
    );

    renderPopover({ onApplyToFrame, onClose });

    act(() => {
      getPresetButton(getBorderPresetDisplayName(DEFAULT_BORDER_PRESET)).click();
    });

    expect(onApplyToFrame).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    clickTrusted(getPresetButton(getBorderPresetDisplayName(DEFAULT_BORDER_PRESET)));

    expect(onApplyToFrame).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('applies a different trusted preset without closing the catalog', async () => {
    const onApplyToFrame = vi.fn();
    const onClose = vi.fn();
    const persistedSettings = createPersistedSettings();
    const persistedPreset = persistedSettings.borderPresets[0]!;
    storageMocks.loadHighlighterSettings.mockResolvedValue(persistedSettings);

    renderPopover({
      borderSettings: projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET),
      onApplyToFrame,
      onClose,
    });
    await flushAsyncEffects();

    clickTrusted(getPresetButton('Persisted preset'));

    expect(onApplyToFrame).toHaveBeenCalledTimes(1);
    expect(onApplyToFrame).toHaveBeenCalledWith({
      borderSettings: projectBorderPresetToAppliedSettings(persistedPreset),
      blurSettings: DEFAULT_BLUR_SETTINGS,
      focusSettings: DEFAULT_FOCUS_SETTINGS,
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it.each(['blur', 'focus'] as const)(
    'keeps the selected template visible for %s despite a legacy hidden-decoration value',
    (effectMode) => {
      const presetName = getBorderPresetDisplayName(DEFAULT_BORDER_PRESET);
      storageMocks.loadHighlighterSettings.mockReturnValue(
        new Promise<HighlighterSettings>(() => undefined)
      );

      renderPopover({
        effectMode,
        borderSettings: projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET),
        ...(effectMode === 'blur'
          ? { blurSettings: { ...DEFAULT_BLUR_SETTINGS, showBorder: false } }
          : { focusSettings: { ...DEFAULT_FOCUS_SETTINGS, showBorder: false } }),
      });

      expect(getPresetButton(presetName).classList).toContain('sniptale-glass-preset-item--active');
      const decorationSwitch = document.querySelector('.sniptale-glass-switch');
      expect(decorationSwitch).not.toBeNull();
      expect(decorationSwitch?.classList).not.toContain('sniptale-glass-switch--on');
    }
  );

  it.each(['border', 'blur', 'focus'] as const)(
    'closes when the already selected %s effect mode is clicked',
    (effectMode) => {
      const onClose = vi.fn();
      const onEffectModeChange = vi.fn();
      storageMocks.loadHighlighterSettings.mockReturnValue(
        new Promise<HighlighterSettings>(() => undefined)
      );
      renderPopover({ effectMode, onClose, onEffectModeChange });

      const label = translate(
        effectMode === 'border'
          ? 'content.interactiveFrame.effectBorder'
          : effectMode === 'blur'
            ? 'content.interactiveFrame.effectBlur'
            : 'content.interactiveFrame.effectFocus'
      );
      const activeMode = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.title === label
      );
      expect(activeMode).not.toBeNull();
      act(() => activeMode?.click());

      expect(onClose).toHaveBeenCalledOnce();
      expect(onEffectModeChange).not.toHaveBeenCalled();
    }
  );

  it('does not treat pointer interaction inside the popover as an outside dismissal', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    storageMocks.loadHighlighterSettings.mockReturnValue(
      new Promise<HighlighterSettings>(() => undefined)
    );
    renderPopover({ onClose });
    act(() => vi.advanceTimersByTime(200));

    const label = document.querySelector<HTMLElement>('.sniptale-content-popover-section-label');
    label?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
    label?.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));

    expect(onClose).not.toHaveBeenCalled();
    expect(document.querySelector('.sniptale-frame-settings-popover')).not.toBeNull();
    vi.useRealTimers();
  });

  it('keeps the frame menu open when an owned overwrite-preset option is selected', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const applied = projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET);
    const {
      sourcePresetId: _sourcePresetId,
      sourcePresetName: _sourcePresetName,
      ...manualBorderSettings
    } = applied;
    const firstPreset = createPersistedSettings().borderPresets[0]!;
    const secondPreset = { ...firstPreset, id: 'second-preset', name: 'Second preset', order: 1 };
    storageMocks.loadHighlighterSettings.mockResolvedValue(
      createPersistedSettings({ borderPresets: [firstPreset, secondPreset] })
    );

    try {
      renderPopover({ borderSettings: manualBorderSettings, onClose, scope: 'session' });
      await flushAsyncEffects();
      act(() => vi.advanceTimersByTime(350));

      act(() =>
        document.querySelector<HTMLButtonElement>('[data-frame-style-action="fork"]')?.click()
      );

      act(() =>
        document
          .querySelector<HTMLButtonElement>(
            `button[aria-label="${translate('highlighter.editor.saveSection')}"]`
          )
          ?.click()
      );

      const select = document.querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('content.overlayControls.frameStyleOverwrite')}"]`
      );
      expect(select).not.toBeNull();
      act(() => select?.click());

      act(() => {
        document.body.dispatchEvent(
          new MouseEvent('mousemove', {
            bubbles: true,
            clientX: 1000,
            clientY: 1000,
            composed: true,
          })
        );
        document.body.dispatchEvent(
          new MouseEvent('mousedown', {
            bubbles: true,
            clientX: 1000,
            clientY: 1000,
            composed: true,
          })
        );
        vi.advanceTimersByTime(250);
      });
      expect(onClose).not.toHaveBeenCalled();

      const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
        (candidate) => candidate.textContent === secondPreset.name
      );
      expect(option).not.toBeNull();
      act(() => {
        option?.dispatchEvent(
          new MouseEvent('mousemove', {
            bubbles: true,
            clientX: 1000,
            clientY: 1000,
            composed: true,
          })
        );
        option?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, composed: true }));
        option?.click();
      });

      expect(onClose).not.toHaveBeenCalled();
      expect(document.querySelector('.sniptale-frame-settings-popover')).not.toBeNull();
      expect(select?.textContent).toContain(secondPreset.name);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('FrameSettingsPopover preset catalog actions', () => {
  it('keeps a disabled style visible for undo during the current session and hides it after reopen', async () => {
    const firstPreset = createPersistedSettings().borderPresets[0]!;
    const secondPreset = { ...firstPreset, id: 'second-preset', name: 'Second preset', order: 1 };
    const enabledSettings = createPersistedSettings({
      borderPresets: [firstPreset, secondPreset],
    });
    const disabledSettings = createPersistedSettings({
      borderPresets: [{ ...firstPreset, enabled: false }, secondPreset],
      defaultBorderPresetId: secondPreset.id,
    });
    storageMocks.loadHighlighterSettings
      .mockResolvedValueOnce(enabledSettings)
      .mockResolvedValueOnce(disabledSettings)
      .mockResolvedValueOnce(enabledSettings)
      .mockResolvedValue(disabledSettings);
    storageMocks.setBorderPresetEnabled.mockResolvedValue(true);

    renderPopover();
    await flushAsyncEffects();

    const row = getPresetRow(firstPreset.name);
    const visibilityButton = row.querySelector<HTMLElement>(
      '[data-frame-style-action="toggle-visibility"]'
    );
    expect(visibilityButton).not.toBeNull();
    clickTrusted(visibilityButton!);
    await flushAsyncEffects();

    expect(storageMocks.setBorderPresetEnabled).toHaveBeenCalledWith(firstPreset.id, false);
    expect(getPresetRow(firstPreset.name).dataset['enabled']).toBe('false');
    expect(document.body.textContent).toContain(firstPreset.name);

    clickTrusted(
      getPresetRow(firstPreset.name).querySelector<HTMLElement>(
        '[data-frame-style-action="toggle-visibility"]'
      )!
    );
    await flushAsyncEffects();
    expect(storageMocks.setBorderPresetEnabled).toHaveBeenLastCalledWith(firstPreset.id, true);
    expect(getPresetRow(firstPreset.name).dataset['enabled']).toBe('true');

    clickTrusted(
      getPresetRow(firstPreset.name).querySelector<HTMLElement>(
        '[data-frame-style-action="toggle-visibility"]'
      )!
    );
    await flushAsyncEffects();
    expect(getPresetRow(firstPreset.name).dataset['enabled']).toBe('false');

    renderPopover({ isOpen: false });
    renderPopover({ isOpen: true });
    await flushAsyncEffects();

    expect(document.body.textContent).not.toContain(firstPreset.name);
    expect(document.body.textContent).toContain(secondPreset.name);
  });

  it('forks the selected template into the inline manual editor', async () => {
    storageMocks.loadHighlighterSettings.mockResolvedValue(createPersistedSettings());
    renderPopover();
    await flushAsyncEffects();

    clickTrusted(
      getPresetRow('Persisted preset').querySelector<HTMLElement>('.sniptale-glass-preset-item')!
    );
    const forkButton = getPresetRow('Persisted preset').querySelector<HTMLElement>(
      '[data-frame-style-action="fork"]'
    );
    forkButton?.focus();
    clickTrusted(forkButton!);
    expect(document.querySelector('[data-ui="shared.border-style-inspector"]')).not.toBeNull();
    expect(document.body.textContent).toContain(translate('content.templateFork.temporaryStatus'));
    expect(document.querySelector('.sniptale-modal')).toBeNull();
    expect(document.querySelector('[data-frame-style-action="add"]')).toBeNull();
  });
});
