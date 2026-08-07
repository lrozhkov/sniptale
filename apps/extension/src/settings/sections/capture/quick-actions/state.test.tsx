// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useQuickActionsEditorState, useQuickActionsUiState } from './state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let editorState: ReturnType<typeof useQuickActionsEditorState> | null = null;
let uiState: ReturnType<typeof useQuickActionsUiState> | null = null;

function EditorHarness() {
  editorState = useQuickActionsEditorState();
  return null;
}

function UiHarness() {
  uiState = useQuickActionsUiState();
  return null;
}

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
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
  editorState = null;
  uiState = null;
  vi.unstubAllGlobals();
});

it('creates editor state with null defaults and a reset helper', async () => {
  await renderNode(<EditorHarness />);

  expect(editorState).toMatchObject({
    editForm: null,
    editingId: null,
  });

  act(() => {
    editorState?.setEditingId('action-1');
    editorState?.setEditForm({ id: 'action-1' } as never);
  });

  expect(editorState?.editingId).toBe('action-1');
  expect(editorState?.editForm).toEqual({ id: 'action-1' });

  act(() => {
    editorState?.resetEditor();
  });

  expect(editorState?.editingId).toBeNull();
  expect(editorState?.editForm).toBeNull();
});

it('creates ui state with stable defaults for hover, drag, and loading', async () => {
  await renderNode(<UiHarness />);

  expect(uiState).toMatchObject({
    confirmDelete: null,
    displayMode: 'list',
    draggedId: null,
    dragOverId: null,
    hoveredId: null,
    isLoading: true,
  });
});
