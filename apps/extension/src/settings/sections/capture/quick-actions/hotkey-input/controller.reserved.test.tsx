// @vitest-environment jsdom

import { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HotkeyConfig } from '../../../../../contracts/settings';
import {
  type HotkeyKeyboardEvent,
  type HotkeyMouseEvent,
  useHotkeyInputController,
} from './controller';

const mocks = vi.hoisted(() => ({
  formatHotkeyMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: mocks.translateMock,
}));

vi.mock('../../../../../features/keyboard-shortcuts/hotkey-format', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../features/keyboard-shortcuts/hotkey-format')
  >()),
  formatHotkey: mocks.formatHotkeyMock,
}));

type ControllerState = ReturnType<typeof useHotkeyInputController>;

let container: HTMLDivElement | null = null;
let latestState: ControllerState | null = null;
let root: Root | null = null;

function HotkeyHarness(props: {
  onChange: (hotkey: HotkeyConfig | null) => void;
  onError?: (message: string) => void;
  value?: HotkeyConfig | null;
}) {
  const state = useHotkeyInputController(props);

  useEffect(() => {
    latestState = state;
  });

  return null;
}

function getState() {
  if (!latestState) {
    throw new Error('Hook state is not ready');
  }

  return latestState;
}

function createHotkeyValue(key: string): HotkeyConfig {
  return {
    altKey: false,
    ctrlKey: true,
    key,
    metaKey: false,
    shiftKey: false,
  };
}

function createKeyboardEvent(
  key: string,
  overrides: Partial<HotkeyKeyboardEvent> = {}
): HotkeyKeyboardEvent {
  return {
    altKey: false,
    ctrlKey: false,
    key,
    metaKey: false,
    preventDefault: vi.fn(),
    shiftKey: false,
    stopPropagation: vi.fn(),
    ...overrides,
  };
}

function createMouseEvent(): HotkeyMouseEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

async function renderHarness(
  props: {
    onChange?: (hotkey: HotkeyConfig | null) => void;
    onError?: (message: string) => void;
    value?: HotkeyConfig | null;
  } = {}
) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
  }
  if (!root) {
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HotkeyHarness onChange={vi.fn()} onError={vi.fn()} value={null} {...props} />);
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.formatHotkeyMock.mockImplementation((value: HotkeyConfig) => `${value.key}-formatted`);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestState = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useHotkeyInputController reserved shortcuts', () => {
  it('shows reserved feedback and restores the previous display value after timeout', async () => {
    const onError = vi.fn();

    await renderHarness({ onError, value: createHotkeyValue('P') });

    act(() => {
      getState().handleKeyDown(createKeyboardEvent('R', { ctrlKey: true }));
    });

    expect(onError).toHaveBeenCalledWith('settings.hotkeyInput.reservedCombination');
    expect(getState().displayValue).toBe('settings.hotkeyInput.reservedCombination');

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(getState().displayValue).toBe('P-formatted');
  });

  it('clears feedback timeout on unmount and rejects operating-system shortcuts', async () => {
    const onChange = vi.fn();
    const onError = vi.fn();
    await renderHarness({ onChange, onError, value: createHotkeyValue('P') });

    const baselineFormatHotkeyCalls = mocks.formatHotkeyMock.mock.calls.length;
    act(() => {
      getState().handleKeyDown(createKeyboardEvent('R', { ctrlKey: true }));
      root?.unmount();
      root = null;
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    await renderHarness({ onChange, onError });
    act(() => {
      getState().handleKeyDown(createKeyboardEvent('Tab', { altKey: true }));
    });

    expect(mocks.formatHotkeyMock.mock.calls.length).toBe(baselineFormatHotkeyCalls);
    expect(onChange).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('settings.hotkeyInput.reservedCombination');
    expect(getState().displayValue).toBe('settings.hotkeyInput.reservedCombination');
  });
});

describe('useHotkeyInputController clear', () => {
  it('clears the hotkey from the clear button handler', async () => {
    const onChange = vi.fn();
    await renderHarness({ onChange });

    act(() => {
      getState().handleClear(createMouseEvent());
    });

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
