// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AutosaveControl } from './index';
let host: HTMLDivElement;
let root: Root;
const labels = {
  title: 'Autosave',
  switch: 'Automatically',
  errorDescription: 'Latest edits were not saved',
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
  expect(host.querySelector('.lucide-cloud-sync')).not.toBeNull();
  act(() => vi.advanceTimersByTime(200));
  expect(host.querySelector('.lucide-cloud-sync path[class]')).toBeNull();
  draw({ state: 'saved' });
  expect(host.querySelector('.lucide-cloud-check')).not.toBeNull();
  act(() => vi.advanceTimersByTime(500));
  expect(host.querySelector('.lucide-cloud-sync')).toBeNull();
  draw({ state: 'saving' });
  act(() => vi.advanceTimersByTime(350));
  expect(host.querySelector('.lucide-cloud-sync')?.getAttribute('class')).toContain('animate-spin');
  draw({ state: 'saved' });
  expect(host.querySelector('.lucide-cloud-sync')).toBeNull();
});
it('keeps conflict explanation available even with autosave disabled and dismisses outside', () => {
  draw({ state: 'conflict', enabled: false, actions: <button>Save copy</button> });
  const trigger = host.querySelector('button')!;
  expect(trigger.getAttribute('aria-label')).toContain(labels.conflict);
  expect(trigger.querySelector('.lucide-cloud-alert')).not.toBeNull();
  act(() => trigger.click());
  expect(document.querySelector('[role=alert]')?.textContent).toBe(labels.conflict);
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('Save copy');
  act(() => document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
  expect(document.querySelector('[role=dialog]')).toBeNull();
});

it('uses the four requested cloud icons and a neutral, separately labelled switch', () => {
  draw({ enabled: false, state: 'saved' });
  expect(host.querySelector('.lucide-cloud-off')?.getAttribute('class')).toContain('color-warning');
  act(() => host.querySelector('button')!.click());
  const dialog = document.querySelector('[role=dialog]')!;
  expect(dialog.textContent?.match(/Autosave/g)).toBeNull();
  expect(dialog.textContent).toContain(labels.switch);
  expect(
    dialog.querySelector('.peer-checked\\:bg-\\[var\\(--sniptale-color-accent\\)\\]')
  ).toBeNull();
});

it('prioritizes red failure over paused yellow and colors only the check when saved', () => {
  draw({ enabled: false, state: 'error', openOnError: true });
  expect(host.querySelector('.lucide-cloud-alert')?.getAttribute('class')).toContain(
    'color-danger'
  );
  expect(
    document.querySelector('[role=dialog] .lucide-cloud-alert')?.getAttribute('class')
  ).toContain('color-danger');
  draw({ enabled: true, state: 'saved' });
  const check = host.querySelector('.lucide-cloud-check');
  expect(check?.getAttribute('class')).toContain('path:first-child');
  expect(check?.getAttribute('class')).not.toContain('text-[var(--sniptale-color-success)]');
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
