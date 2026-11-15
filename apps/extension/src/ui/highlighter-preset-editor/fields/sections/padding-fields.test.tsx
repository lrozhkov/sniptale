// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { EditorPaddingFields } from './padding-fields';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderUi(element: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

it('updates padding with parsed numbers and falls back to zero for invalid input', async () => {
  const updatePadding = vi.fn();

  await renderUi(
    <EditorPaddingFields
      padding={{ top: 1, right: 2, bottom: 3, left: 4 }}
      updatePadding={updatePadding}
    />
  );

  const inputs = container?.querySelectorAll('input') ?? [];
  expect(inputs).toHaveLength(4);

  await act(async () => {
    setInputValue(inputs[0] as HTMLInputElement, '7');
    setInputValue(inputs[1] as HTMLInputElement, '');
  });

  expect(updatePadding).toHaveBeenCalledWith('top', 7);
  expect(updatePadding).toHaveBeenCalledWith('right', 0);
});

it.each(['top', 'right', 'bottom', 'left'] as const)(
  'steps focused %s padding through its existing update callback',
  async (side) => {
    const updatePadding = vi.fn();
    await renderUi(
      <EditorPaddingFields
        padding={{ top: 1, right: 2, bottom: 3, left: 4 }}
        updatePadding={updatePadding}
      />
    );
    const index = ['top', 'right', 'bottom', 'left'].indexOf(side);
    const input = container!.querySelectorAll('input')[index]!;
    const ignored = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    await act(async () => input.dispatchEvent(ignored));
    expect(ignored.defaultPrevented).toBe(false);
    expect(updatePadding).not.toHaveBeenCalled();
    const wheel = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    await act(async () => {
      input.focus();
      input.dispatchEvent(wheel);
    });
    expect(wheel.defaultPrevented).toBe(true);
    expect(updatePadding).toHaveBeenCalledWith(side, index + 2);
    expect(document.activeElement).toBe(input);
  }
);
