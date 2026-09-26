// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AutosaveControl } from './index';
let host: HTMLDivElement;
let root: Root;
const labels = {
  title: 'Autosave',
  on: 'Saved automatically',
  off: 'Edits stay here',
  paused: 'Not saving',
  dirty: 'Unsaved',
  saving: 'Saving',
  saved: 'Saved',
  error: 'Save failed',
  conflict: 'Changed in another tab; reload latest',
  close: 'Close',
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function draw(props: Partial<ComponentProps<typeof AutosaveControl>> = {}) {
  act(() =>
    root.render(
      <AutosaveControl enabled state="saved" onChange={vi.fn()} labels={labels} {...props} />
    )
  );
}
it('opens a themed disclosure, toggles the setting and restores focus on Escape', () => {
  const onChange = vi.fn();
  draw({ onChange });
  const trigger = host.querySelector('button')!;
  act(() => trigger.click());
  const input = document.querySelector<HTMLInputElement>('[role=switch]')!;
  expect(document.activeElement).toBe(input);
  act(() => input.click());
  expect(onChange).toHaveBeenCalledWith(false);
  draw({ enabled: false, onChange });
  expect(document.querySelector('[role=dialog]')?.textContent).toContain(labels.off);
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role=dialog]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it('does not flash a spinner for short saves and respects reduced motion', () => {
  draw({ state: 'saving' });
  act(() => vi.advanceTimersByTime(200));
  expect(host.querySelector('.motion-safe\\:animate-spin')).toBeNull();
  draw({ state: 'saved' });
  act(() => vi.advanceTimersByTime(500));
  expect(host.querySelector('.motion-safe\\:animate-spin')).toBeNull();
  draw({ state: 'saving' });
  act(() => vi.advanceTimersByTime(350));
  expect(host.querySelector('.motion-safe\\:animate-spin')).not.toBeNull();
  draw({ state: 'saved' });
  expect(host.querySelector('.motion-safe\\:animate-spin')).toBeNull();
});
it('keeps conflict explanation available even with autosave disabled and dismisses outside', () => {
  draw({ state: 'conflict', enabled: false });
  const trigger = host.querySelector('button')!;
  expect(trigger.getAttribute('aria-label')).toContain(labels.conflict);
  act(() => trigger.click());
  expect(document.querySelector('[role=alert]')?.textContent).toBe(labels.conflict);
  act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  expect(document.querySelector('[role=dialog]')).toBeNull();
});

it('contains Tab traversal and restores the trigger after document-level dismissal', () => {
  draw();
  const trigger = host.querySelector('button')!;
  act(() => trigger.click());
  const dialog = document.querySelector('[role=dialog]')!;
  const input = dialog.querySelector<HTMLInputElement>('input')!;
  const close = dialog.querySelector<HTMLButtonElement>('button')!;
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
  expect(document.activeElement).toBe(close);
  act(() =>
    close.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
      })
    )
  );
  expect(document.activeElement).toBe(input);
  act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.querySelector('[role=dialog]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
