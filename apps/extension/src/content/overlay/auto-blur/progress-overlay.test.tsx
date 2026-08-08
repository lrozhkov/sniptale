// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AutoBlurProgressOverlay } from './progress-overlay';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('waits 500ms before blocking the page and lets the user cancel', () => {
  const onCancel = vi.fn();
  act(() => root.render(<AutoBlurProgressOverlay active onCancel={onCancel} />));

  expect(container.querySelector('[data-ui="content.auto-blur.full-page-progress"]')).toBeNull();
  act(() => vi.advanceTimersByTime(499));
  expect(container.querySelector('[data-ui="content.auto-blur.full-page-progress"]')).toBeNull();
  act(() => vi.advanceTimersByTime(1));

  const overlay = container.querySelector<HTMLElement>(
    '[data-ui="content.auto-blur.full-page-progress"]'
  );
  expect(overlay).not.toBeNull();
  act(() => {
    overlay?.querySelector<HTMLButtonElement>('button')?.click();
  });
  expect(onCancel).toHaveBeenCalledOnce();
});

it('never flashes the blocking surface when scanning finishes within the delay', () => {
  const onCancel = vi.fn();
  act(() => root.render(<AutoBlurProgressOverlay active onCancel={onCancel} />));
  act(() => vi.advanceTimersByTime(300));
  act(() => root.render(<AutoBlurProgressOverlay active={false} onCancel={onCancel} />));
  act(() => vi.advanceTimersByTime(500));

  expect(container.querySelector('[data-ui="content.auto-blur.full-page-progress"]')).toBeNull();
});

it('traps keyboard focus while visible and restores the previous control on completion', () => {
  const previous = document.createElement('button');
  document.body.appendChild(previous);
  previous.focus();
  act(() => root.render(<AutoBlurProgressOverlay active onCancel={vi.fn()} />));
  act(() => vi.advanceTimersByTime(500));

  const overlay = container.querySelector<HTMLElement>(
    '[data-ui="content.auto-blur.full-page-progress"]'
  );
  const cancel = overlay?.querySelector<HTMLButtonElement>('button');
  expect(document.activeElement).toBe(cancel);
  act(() => overlay?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' })));
  expect(document.activeElement).toBe(cancel);

  act(() => root.render(<AutoBlurProgressOverlay active={false} onCancel={vi.fn()} />));
  expect(document.activeElement).toBe(previous);
  previous.remove();
});
