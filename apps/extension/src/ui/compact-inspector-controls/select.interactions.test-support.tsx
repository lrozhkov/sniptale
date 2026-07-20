import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { expect } from 'vitest';

import { CompactSelect } from './index';

const DARK_OPTION = [{ value: 'dark', label: 'Dark' }] as const;
export const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

export function render(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(node));
}

export function getContainer() {
  return container!;
}

export function getTrigger() {
  return container!.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]')!;
}

export function getMenuOptions() {
  return document.body.querySelectorAll<HTMLButtonElement>('[role="option"]');
}

export function cleanupSelectRoot() {
  if (!root || !container) {
    return;
  }
  act(() => root!.unmount());
  root = null;
  container!.remove();
  container = null;
}

export function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

export function renderPreventedSelect(args: {
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  triggerRef: (element: HTMLButtonElement | null) => void;
}) {
  render(
    <div>
      <CompactSelect
        ref={args.triggerRef}
        aria-label="Prevented"
        value="dark"
        onClick={args.onClick}
        onKeyDown={args.onKeyDown}
        onChange={() => undefined}
        options={DARK_OPTION}
      />
      <button type="button">Next field</button>
    </div>
  );
}

export function rerenderPlainSelectWithNextField() {
  act(() => {
    root!.render(
      <div>
        <CompactSelect
          aria-label="Theme"
          value="dark"
          onChange={() => undefined}
          options={DARK_OPTION}
        />
        <button type="button">Next field</button>
      </div>
    );
  });
}

export async function openSelectAndCloseOutside(trigger: HTMLButtonElement) {
  await act(async () => {
    trigger.click();
    await nextFrame();
  });
  expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();

  await act(async () => {
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    await Promise.resolve();
  });
  expect(document.body.querySelector('[role="listbox"]')).toBeNull();
}
