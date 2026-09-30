// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GalleryKeyboardHelp } from './keyboard-help';
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(<GalleryKeyboardHelp />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it('opens an accessible bounded help dialog, traps Tab and restores its trigger on Escape', () => {
  const trigger = container.querySelector<HTMLButtonElement>('button')!;
  act(() => {
    trigger.focus();
    trigger.click();
  });
  const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(dialog).not.toBeNull();
  const title = document.getElementById(dialog.getAttribute('aria-labelledby')!);
  expect(title?.textContent).toBe(trigger.getAttribute('aria-label'));
  expect(dialog.textContent).toContain('Space');
  expect(dialog.textContent).toContain('Ctrl+A');
  const close = dialog.querySelector<HTMLButtonElement>('button')!;
  expect(close.getAttribute('aria-label')).toBeTruthy();
  expect(document.activeElement).toBe(close);
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  act(() => close.dispatchEvent(tab));
  expect(tab.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(close);
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  act(() => close.dispatchEvent(escape));
  expect(escape.defaultPrevented).toBe(true);
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it('does not close on composing or repeated Escape and displays Mac labels', () => {
  vi.stubGlobal('navigator', { platform: 'MacIntel' });
  act(() => container.querySelector<HTMLButtonElement>('button')?.click());
  const close = container.querySelector<HTMLButtonElement>('[role="dialog"] button')!;
  expect(container.textContent).toContain('⌘A');
  expect(container.textContent).toContain('⌘F');
  act(() =>
    close.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true })
    )
  );
  act(() =>
    close.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', repeat: true, bubbles: true })
    )
  );
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
  act(() => close.click());
  expect(container.querySelector('[role="dialog"]')).toBeNull();
});
