// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSavePresetDragState } from './drag';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useSavePresetDragState> | null = null;

function DragStateHarness() {
  latestState = useSavePresetDragState();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<DragStateHarness />);
  });
}

function getState() {
  if (!latestState) {
    throw new Error('Expected drag state');
  }

  return latestState;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

describe('useSavePresetDragState', () => {
  it('tracks dragged, drag-over, and hovered preset identifiers', async () => {
    await renderHarness();

    act(() => {
      getState().setDraggedId('preset-1');
      getState().setDragOverId('preset-2');
      getState().setHoveredPresetId('preset-3');
    });

    expect(getState().draggedId).toBe('preset-1');
    expect(getState().dragOverId).toBe('preset-2');
    expect(getState().hoveredPresetId).toBe('preset-3');
  });
});
