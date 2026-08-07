// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTransientControlVisibility } from './transient-control-visibility';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let visibility: ReturnType<typeof useTransientControlVisibility> | null = null;

function Harness(props: { pinned: boolean }) {
  visibility = useTransientControlVisibility(props.pinned);
  return null;
}

function renderHarness(pinned: boolean) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  act(() => root?.render(<Harness pinned={pinned} />));
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  visibility = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('hides controls when settings close after the pointer already left', () => {
  renderHarness(true);
  act(() => visibility?.handleMouseEnter());
  act(() => visibility?.handleMouseLeave());
  expect(visibility?.isVisible).toBe(true);

  renderHarness(false);

  expect(visibility?.isVisible).toBe(false);
});

it('retains the grace interval for an ordinary unpinned pointer leave', () => {
  renderHarness(false);
  act(() => visibility?.handleMouseEnter());
  act(() => visibility?.handleMouseLeave());
  expect(visibility?.isVisible).toBe(true);

  act(() => vi.advanceTimersByTime(320));

  expect(visibility?.isVisible).toBe(false);
});
