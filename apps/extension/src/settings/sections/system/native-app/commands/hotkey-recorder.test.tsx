// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { HotkeyRecorder } from './hotkey-recorder';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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

it('records normalized shortcut labels and ignores modifier-only keys', async () => {
  const onChange = vi.fn();
  renderRecorder({ onChange });
  const button = findRecordButton();

  await recordShortcut(button, { ctrlKey: true, key: 'Shift' });
  await recordShortcut(button, { ctrlKey: true, key: ' ' });
  await recordShortcut(button, { altKey: true, key: '+' });
  await recordShortcut(button, { code: 'KeyS', ctrlKey: true, key: 'ы' });

  expect(onChange).not.toHaveBeenCalledWith('Ctrl+Shift');
  expect(onChange).toHaveBeenCalledWith('Ctrl+Space');
  expect(onChange).toHaveBeenCalledWith('Alt+Plus');
  expect(onChange).toHaveBeenCalledWith('Ctrl+S');
});

it('cancels recording with Escape and clears with Delete or the clear button', async () => {
  const onChange = vi.fn();
  renderRecorder({ onChange, value: 'Ctrl+S' });
  const button = findRecordButton();

  await recordShortcut(button, { key: 'Escape' });
  await recordShortcut(button, { key: 'Delete' });
  await clickClearButton();

  expect(onChange).toHaveBeenCalledTimes(2);
  expect(onChange).toHaveBeenCalledWith('');
});

it('renders clear action inside the hotkey field without a separate frame', () => {
  const onChange = vi.fn();
  renderRecorder({ onChange, value: 'Ctrl+S' });

  const clearButton = findClearButton();

  expect(clearButton.className).toContain('absolute');
  expect(clearButton.className).toContain('group-hover:opacity-100');
  expect(clearButton.className).not.toContain('border');
});

function renderRecorder(props: { onChange: (value: string) => void; value?: string }): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <HotkeyRecorder
        disabled={false}
        label="Hotkey"
        onChange={props.onChange}
        value={props.value ?? ''}
      />
    );
  });
}

function findRecordButton(): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>('button[aria-label="Hotkey"]');
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

async function recordShortcut(button: HTMLButtonElement, init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    button.click();
  });
  await act(async () => {
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
  });
}

async function clickClearButton(): Promise<void> {
  await act(async () => {
    findClearButton().click();
  });
}

function findClearButton(): HTMLButtonElement {
  const button = container?.querySelector<HTMLButtonElement>(
    'button[aria-label="Очистить горячую клавишу"]'
  );
  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}
