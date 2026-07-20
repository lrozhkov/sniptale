// @vitest-environment jsdom

import type { ReactElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_LOADING_FALLBACK_DELAY_MS, DelayedLoadingFallback } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderElement(element: ReactElement | null) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(element);
  });
}

function fallback() {
  return <div data-testid="delayed-fallback">loading</div>;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('DelayedLoadingFallback', () => {
  it('hides the fallback before the default delay elapses', () => {
    renderElement(<DelayedLoadingFallback fallback={fallback()} />);

    expect(container?.querySelector('[data-testid="delayed-fallback"]')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(DEFAULT_LOADING_FALLBACK_DELAY_MS - 1);
    });
    expect(container?.querySelector('[data-testid="delayed-fallback"]')).toBeNull();
  });

  it('shows the fallback after the default delay elapses', () => {
    renderElement(<DelayedLoadingFallback fallback={fallback()} />);

    act(() => {
      vi.advanceTimersByTime(DEFAULT_LOADING_FALLBACK_DELAY_MS);
    });

    expect(container?.querySelector('[data-testid="delayed-fallback"]')).not.toBeNull();
  });

  it('clears the pending timer when unmounted before the delay', () => {
    renderElement(<DelayedLoadingFallback fallback={fallback()} />);
    renderElement(null);

    act(() => {
      vi.advanceTimersByTime(DEFAULT_LOADING_FALLBACK_DELAY_MS);
    });

    expect(container?.querySelector('[data-testid="delayed-fallback"]')).toBeNull();
  });

  it('renders immediately when the delay is disabled', () => {
    renderElement(<DelayedLoadingFallback delayMs={0} fallback={fallback()} />);

    expect(container?.querySelector('[data-testid="delayed-fallback"]')).not.toBeNull();
  });
});
