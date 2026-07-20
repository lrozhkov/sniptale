// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
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
