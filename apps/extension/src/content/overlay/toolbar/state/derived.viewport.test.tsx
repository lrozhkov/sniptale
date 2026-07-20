// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToolbarViewportState } from './derived.viewport';

type ViewportState = ReturnType<typeof useToolbarViewportState>;

let container: HTMLDivElement | null = null;
let latestState: ViewportState | null = null;
let root: Root | null = null;

function ViewportHarness(props: {
  onViewportChange?: (viewport: { width: number; height: number } | null) => void;
  propViewport?: { width: number; height: number } | null;
}) {
  const state = useToolbarViewportState(props);

  useEffect(() => {
    latestState = state;
  });

  return null;
}

async function renderHarness(props: React.ComponentProps<typeof ViewportHarness>) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ViewportHarness {...props} />);
  });
}

function getState() {
  if (!latestState) {
    throw new Error('Expected viewport state');
  }

  return latestState;
}

describe('useToolbarViewportState', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    latestState = null;
    container?.remove();
    container = null;
    vi.unstubAllGlobals();
  });

  it('uses local viewport state when the toolbar is uncontrolled', async () => {
    await renderHarness({});

    act(() => {
      getState().setCurrentViewport({ width: 640, height: 480 });
    });

    expect(getState().currentViewport).toEqual({ width: 640, height: 480 });
  });

  it('prefers controlled viewport ownership when props are provided', async () => {
    const onViewportChange = vi.fn();

    await renderHarness({
      onViewportChange,
      propViewport: { width: 800, height: 600 },
    });

    act(() => {
      getState().setCurrentViewport({ width: 1024, height: 768 });
    });

    expect(getState().currentViewport).toEqual({ width: 800, height: 600 });
    expect(onViewportChange).toHaveBeenCalledWith({ width: 1024, height: 768 });
  });
});
