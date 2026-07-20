// @vitest-environment jsdom

import React, { useEffect } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useToolbarDragController } from './drag-position.controller';

type DragControllerState = ReturnType<typeof useToolbarDragController>;

let container: HTMLDivElement | null = null;
let latestState: DragControllerState | null = null;
let root: Root | null = null;

function DragControllerHarness() {
  const state = useToolbarDragController({ x: 40, y: 12 });

  useEffect(() => {
    latestState = state;
  });

  return <div ref={state.toolbarRef} />;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<DragControllerHarness />);
  });
}

function getState() {
  if (!latestState) {
    throw new Error('Expected drag controller state');
  }

  return latestState;
}

describe('useToolbarDragController', () => {
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

  it('captures drag offsets and enables dragging on mousedown', async () => {
    await renderHarness();

    const preventDefault = vi.fn();

    act(() => {
      getState().handleMouseDown({
        clientX: 100,
        clientY: 60,
        preventDefault,
      } as unknown as React.MouseEvent<HTMLDivElement>);
    });

    expect(getState().isDragging).toBe(true);
    expect(getState().dragOffset.current).toEqual({ x: 60, y: 48 });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});
