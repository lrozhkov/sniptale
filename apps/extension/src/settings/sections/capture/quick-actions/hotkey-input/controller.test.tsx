// @vitest-environment jsdom

import { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HotkeyConfig } from '../../../../../contracts/settings';
import { type HotkeyKeyboardEvent, useHotkeyInputController } from './controller';

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

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
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
    root = createRoot(container);
  }

  const nextProps = {
    onChange: vi.fn(),
    onError: vi.fn(),
    value: null,
    ...props,
  };

  await act(async () => {
    root?.render(<HotkeyHarness {...nextProps} />);
  });
  await flushEffects();

  return nextProps;
}

function getState() {
  if (!latestState) {
    throw new Error('Hook state is not ready');
  }

  return latestState;
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

function createHotkeyValue(key: string): HotkeyConfig {
  return {
    altKey: false,
    ctrlKey: true,
    key,
    metaKey: false,
    shiftKey: false,
  };
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

describe('useHotkeyInputController initialization', () => {
  it('syncs display value from the current hotkey and toggles recording focus state', async () => {
    await renderHarness({ value: createHotkeyValue('K') });

    expect(getState().displayValue).toBe('K-formatted');
    expect(getState().isRecording).toBe(false);

    act(() => {
      getState().handleFocus();
    });
    expect(getState().isRecording).toBe(true);

    act(() => {
      getState().handleBlur();
    });
    expect(getState().isRecording).toBe(false);
  });
});

async function verifyValidHotkeyAndEscapeHandling() {
  const onChange = vi.fn();
  await renderHarness({ onChange });

  act(() => {
    getState().handleFocus();
    getState().handleKeyDown(createKeyboardEvent('E', { ctrlKey: true }));
    getState().handleKeyDown(createKeyboardEvent('β', { altKey: true, code: 'KeyB' }));
  });

  expect(onChange).toHaveBeenNthCalledWith(1, {
    altKey: false,
    ctrlKey: true,
    key: 'E',
    metaKey: false,
    shiftKey: false,
  });
  expect(getState().isRecording).toBe(false);
  expect(onChange).toHaveBeenNthCalledWith(2, {
    ctrlKey: false,
    key: 'B',
    altKey: true,
    metaKey: false,
    shiftKey: false,
  });

  act(() => {
    getState().handleKeyDown(createKeyboardEvent('Escape'));
  });

  expect(onChange).toHaveBeenCalledTimes(2);
  expect(getState().isRecording).toBe(false);
}

async function verifyModifierValidation() {
  const onChange = vi.fn();
  const onError = vi.fn();
  await renderHarness({ onChange, onError });

  act(() => {
    getState().handleKeyDown(createKeyboardEvent('Shift'));
    getState().handleKeyDown(createKeyboardEvent('K'));
  });

  expect(onChange).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith('settings.hotkeyInput.modifierRequired');
}

async function verifyFunctionAndSpaceKeys() {
  const onChange = vi.fn();
  const onError = vi.fn();
  await renderHarness({ onChange, onError });

  act(() => {
    getState().handleKeyDown(createKeyboardEvent('F8', { ctrlKey: true }));
    getState().handleKeyDown(createKeyboardEvent(' ', { ctrlKey: true }));
  });

  expect(onChange).toHaveBeenNthCalledWith(1, {
    altKey: false,
    ctrlKey: true,
    key: 'Space',
    metaKey: false,
    shiftKey: false,
  });
  expect(onError).toHaveBeenCalledWith('settings.hotkeyInput.unsupportedKey');
}

function runKeyHandlingSuite() {
  it(
    'records valid hotkeys, cancels on escape, and resets recording mode after success',
    verifyValidHotkeyAndEscapeHandling
  );
  it('reports missing modifiers and ignores modifier-only keys', verifyModifierValidation);
  it('rejects function keys and maps the space bar to the Space token', verifyFunctionAndSpaceKeys);
}

describe('useHotkeyInputController key handling', runKeyHandlingSuite);
