// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';
import { useEditorInspectorStoreSlice } from './store';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderStoreSlice() {
  let slice: ReturnType<typeof useEditorInspectorStoreSlice> | null = null;
  const Harness = () => {
    slice = useEditorInspectorStoreSlice();
    return null;
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));
  return () => slice;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  useEditorStore.getState().resetDocumentState();
});

describe('useEditorInspectorStoreSlice', () => {
  it('exposes select normalization and workspace default actions without leaking defaults state', () => {
    const getSlice = renderStoreSlice();

    expect(getSlice()?.setActiveTool).toBe(useEditorStore.getState().setActiveTool);
    expect(getSlice()?.syncActiveTool).toBe(useEditorStore.getState().syncActiveTool);
    expect(getSlice()?.workspace).toBe(useEditorStore.getState().workspace);
    expect(getSlice()?.updateBlurSettings).toBe(useEditorStore.getState().updateBlurSettings);
    expect(getSlice()?.updateLineSettings).toBe(useEditorStore.getState().updateLineSettings);
    expect(getSlice()?.updateSelectionBlurSettings).toBe(
      useEditorStore.getState().updateSelectionBlurSettings
    );
    expect(getSlice()?.updateSelectionLineSettings).toBe(
      useEditorStore.getState().updateSelectionLineSettings
    );
    expect(getSlice()?.updateWorkspaceDefaults).toBe(
      useEditorStore.getState().updateWorkspaceDefaults
    );
    expect('workspaceDefaults' in (getSlice() as Record<string, unknown>)).toBe(false);
  });
});

it('ignores navigation while updating document dimensions and source metadata', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const initial = useEditorStore.getState();
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = vi.fn();
  function Inspector() {
    const state = useEditorInspectorStoreSlice();
    render(state.viewport);
    return null;
  }
  try {
    act(() => root.render(<Inspector />));
    render.mockClear();
    act(() =>
      useEditorStore.getState().updateViewport({ scrollLeft: 100, scrollTop: 50, zoomPercent: 140 })
    );
    expect(render).not.toHaveBeenCalled();
    act(() =>
      useEditorStore.getState().updateViewport({
        canvasWidth: 2000,
        canvasHeight: 1000,
        sourceWidth: 1200,
        sourceHeight: 800,
        sourceName: 'changed',
      })
    );
    expect(render).toHaveBeenCalledOnce();
    expect(render.mock.calls[0]?.[0]).toEqual({
      canvasWidth: 2000,
      canvasHeight: 1000,
      sourceWidth: 1200,
      sourceHeight: 800,
      sourceName: 'changed',
    });
  } finally {
    act(() => root.unmount());
    useEditorStore.setState(initial, true);
    vi.unstubAllGlobals();
  }
});
