// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SavePreset } from '../../../../contracts/settings';
import { useSavePresetDialogs } from './dialogs';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useSavePresetDialogs> | null = null;

function createPreset(): SavePreset {
  return {
    enabled: true,
    id: 'preset-1',
    name: 'Preset 1',
    order: 0,
    path: 'Folder/1',
  };
}

function DialogsHarness() {
  latestState = useSavePresetDialogs();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<DialogsHarness />);
  });
}

function getState() {
  if (!latestState) {
    throw new Error('Expected dialogs state');
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

describe('useSavePresetDialogs', () => {
  it('opens and closes editor and delete-confirm flows', async () => {
    const preset = createPreset();
    await renderHarness();

    act(() => {
      getState().openEditor(preset);
      getState().setConfirmDelete(preset);
    });

    expect(getState().editingPreset).toEqual(preset);
    expect(getState().confirmDelete).toEqual(preset);
    expect(getState().isEditorOpen).toBe(true);

    act(() => {
      getState().closeEditor();
      getState().closeDeleteDialog();
    });

    expect(getState().editingPreset).toBeUndefined();
    expect(getState().confirmDelete).toBeNull();
    expect(getState().isEditorOpen).toBe(false);
  });
});
