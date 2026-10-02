// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ColorSelectorTrigger } from './trigger';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderTrigger(props: Partial<React.ComponentProps<typeof ColorSelectorTrigger>> = {}) {
  if (!container) {
    throw new Error('missing container');
  }

  act(() => {
    root?.render(
      <ColorSelectorTrigger
        formatMode="hex"
        label="Grid color"
        value="#123456"
        onOpenPicker={() => undefined}
        onCommit={() => undefined}
        {...props}
      />
    );
  });
}

function getButton(label: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent?.includes(label) || button.getAttribute('aria-label') === label
  ) as HTMLButtonElement | undefined;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('separates the picker swatch from editable text without a palette trigger', async () => {
  const onOpenPicker = vi.fn();
  renderTrigger({ onOpenPicker });
  expect(
    container?.querySelector('[data-ui="shared.ui.color-selector.palette-trigger"]')
  ).toBeNull();
  expect(getButton('Grid color')?.textContent).toBe('#123456');
  await act(async () => getButton('shared.ui.colorSelectorChooseColor')?.click());
  expect(onOpenPicker).toHaveBeenCalledOnce();
  await act(async () => getButton('Grid color')?.click());
  expect(container?.querySelector('input')?.value).toBe('#123456');
  expect(document.activeElement).toBe(container?.querySelector('input'));
  expect(onOpenPicker).toHaveBeenCalledOnce();
});

async function enterValue(value: string, key: string) {
  await act(async () => getButton('Grid color')?.click());
  const input = container!.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })));
  return input;
}

it('commits a normalized value once and restores keyboard focus', async () => {
  const onCommit = vi.fn();
  renderTrigger({ onCommit });
  await enterValue('#abc', 'Enter');
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('#aabbcc');
  expect(document.activeElement).toBe(getButton('Grid color'));
});

it('retains invalid input without changing the color and Escape cancels it', async () => {
  const onCommit = vi.fn();
  renderTrigger({ onCommit });
  const input = await enterValue('invalid', 'Enter');
  expect(onCommit).not.toHaveBeenCalled();
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(container?.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  );
  expect(getButton('Grid color')?.textContent).toBe('#123456');
  expect(document.activeElement).toBe(getButton('Grid color'));
});

it('rejects alpha and transparent input when unavailable for the consumer', async () => {
  const onCommit = vi.fn();
  renderTrigger({ onCommit, allowAlpha: false, allowTransparent: false });
  await enterValue('#abcdef80', 'Enter');
  expect(onCommit).not.toHaveBeenCalled();
  await enterValue('transparent', 'Enter');
  expect(onCommit).not.toHaveBeenCalled();
});

it('disables both actions and preserves formatted values', () => {
  renderTrigger({ disabled: true, formatMode: 'rgb', value: '#abcdef' });
  expect(getButton('Grid color')?.textContent).toBe('RGB(171, 205, 239)');
  expect([...container!.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
});

it('commits valid input on blur and discards an edit when the consumer value changes', async () => {
  const onCommit = vi.fn();
  renderTrigger({ onCommit });
  const input = await enterValue('#abcdef', 'Tab');
  await act(async () => input.blur());
  expect(onCommit).toHaveBeenCalledExactlyOnceWith('#abcdef');
  await enterValue('#bad', 'Tab');
  renderTrigger({ onCommit, value: '#111111' });
  expect(container?.querySelector('input')).toBeNull();
  expect(getButton('Grid color')?.textContent).toBe('#111111');
  expect(onCommit).toHaveBeenCalledTimes(1);
});
