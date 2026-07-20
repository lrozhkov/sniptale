// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useScenarioWorkspaceStageScale } from './scale';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let resizeObserverCallback: (() => void) | null = null;

class TestResizeObserver {
  constructor(callback: () => void) {
    resizeObserverCallback = callback;
  }

  observe() {}

  disconnect() {
    resizeObserverCallback = null;
  }
}

function ScaleProbe() {
  const { containerRef, scale } = useScenarioWorkspaceStageScale();
  return <div ref={containerRef} data-scale={scale} />;
}

function expectProbe(): HTMLDivElement {
  const probe = container?.querySelector<HTMLDivElement>('[data-scale]');
  expect(probe).not.toBeNull();
  if (!probe) {
    throw new Error('Expected scale probe');
  }

  return probe;
}

function mountScaleProbe() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
}

function unmountScaleProbe() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  resizeObserverCallback = null;
  vi.unstubAllGlobals();
}

describe('useScenarioWorkspaceStageScale', () => {
  beforeEach(mountScaleProbe);
  afterEach(unmountScaleProbe);

  it('updates the stage scale from the observed container width and clamps large widths to one', () => {
    act(() => {
      root?.render(<ScaleProbe />);
    });

    const probe = expectProbe();
    Object.defineProperty(probe, 'clientWidth', {
      configurable: true,
      get: () => 360,
    });

    act(() => {
      resizeObserverCallback?.();
    });

    expect(probe.dataset['scale']).toBe('0.5');

    Object.defineProperty(probe, 'clientWidth', {
      configurable: true,
      get: () => 1440,
    });

    act(() => {
      resizeObserverCallback?.();
    });

    expect(probe.dataset['scale']).toBe('1');
  });
});
