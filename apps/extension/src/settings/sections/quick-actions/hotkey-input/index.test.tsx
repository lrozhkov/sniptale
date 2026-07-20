// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useHotkeyInputControllerSpy } = vi.hoisted(() => ({
  useHotkeyInputControllerSpy: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('./controller', async (importOriginal) => ({
  ...(await importOriginal()),
  useHotkeyInputController: (args: unknown) => useHotkeyInputControllerSpy(args),
}));

import { HotkeyInput } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderInput(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useHotkeyInputControllerSpy.mockReset();
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

async function verifyExistingShortcutRendering() {
  const handleBlur = vi.fn();
  const handleClear = vi.fn();
  const handleFocus = vi.fn();
  const handleKeyDown = vi.fn();

  useHotkeyInputControllerSpy.mockReturnValue({
    displayValue: 'Ctrl+Shift+K',
    handleBlur,
    handleClear,
    handleFocus,
    handleKeyDown,
    inputRef: { current: null },
    isRecording: false,
  });

  const onChange = vi.fn();
  const onError = vi.fn();
  await renderInput(<HotkeyInput value={null} onChange={onChange} onError={onError} />);

  const field = container?.querySelector('[tabindex="0"]') as HTMLDivElement;

  act(() => {
    field.focus();
    field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    field.blur();
    container
      ?.querySelector<HTMLButtonElement>('button[title="settings.hotkeyInput.clearTitle"]')
      ?.click();
  });

  expect(container?.textContent).toContain('Ctrl+Shift+K');
  expect(handleFocus).toHaveBeenCalled();
  expect(handleKeyDown).toHaveBeenCalled();
  expect(handleBlur).toHaveBeenCalled();
  expect(handleClear).toHaveBeenCalled();
  expect(useHotkeyInputControllerSpy).toHaveBeenCalledWith({ onChange, onError, value: null });
}

async function verifyRecordingStateRendering() {
  useHotkeyInputControllerSpy.mockReturnValue({
    displayValue: '',
    handleBlur: vi.fn(),
    handleClear: vi.fn(),
    handleFocus: vi.fn(),
    handleKeyDown: vi.fn(),
    inputRef: { current: null },
    isRecording: true,
  });

  await renderInput(<HotkeyInput value={null} onChange={vi.fn()} />);

  expect(container?.textContent).toContain('settings.hotkeyInput.recordingPlaceholder');
  expect(container?.textContent).toContain('settings.hotkeyInput.recordingHint');
  expect(container?.querySelector('button[title="settings.hotkeyInput.clearTitle"]')).toBeNull();
}

async function verifyDefaultPlaceholderFallback() {
  useHotkeyInputControllerSpy.mockReturnValue({
    displayValue: '',
    handleBlur: vi.fn(),
    handleClear: vi.fn(),
    handleFocus: vi.fn(),
    handleKeyDown: vi.fn(),
    inputRef: { current: null },
    isRecording: false,
  });

  const onChange = vi.fn();
  await renderInput(<HotkeyInput onChange={onChange} />);

  expect(container?.textContent).toContain('settings.hotkeyInput.placeholder');
  expect(useHotkeyInputControllerSpy).toHaveBeenCalledWith({ onChange });
}

function runHotkeyInputSuite() {
  it(
    'renders an existing shortcut and delegates clear interactions to the controller',
    verifyExistingShortcutRendering
  );
  it(
    'shows the recording placeholder and hint while capture is active',
    verifyRecordingStateRendering
  );
  it(
    'falls back to the default placeholder and omits optional controller args when they are not provided',
    verifyDefaultPlaceholderFallback
  );
}

describe('HotkeyInput', runHotkeyInputSuite);
