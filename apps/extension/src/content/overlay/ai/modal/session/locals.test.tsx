// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAIModalEditorState, useAIModalResizeState, useAIModalSettingsState } from './locals';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: {
  editor: ReturnType<typeof useAIModalEditorState>;
  resize: ReturnType<typeof useAIModalResizeState>;
  settings: ReturnType<typeof useAIModalSettingsState>;
} | null = null;

function LocalHooksHarness() {
  latestState = {
    editor: useAIModalEditorState(),
    resize: useAIModalResizeState(),
    settings: useAIModalSettingsState(),
  };
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<LocalHooksHarness />);
  });
}

function getState() {
  if (!latestState) {
    throw new Error('Expected AI modal local hooks state');
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

describe('use-ai-modal-state local hooks', () => {
  it('initializes editor, resize, and settings hooks with canonical default state', async () => {
    await renderHarness();

    expect(getState().editor.isEditorOpen).toBe(false);
    expect(getState().editor.editingTemplate).toBeUndefined();
    expect(getState().resize.isResizing).toBe(false);
    expect(getState().settings.availableModels).toEqual([]);
    expect(getState().settings.globalSystemPrompt).toBe('');
    expect(getState().settings.providers).toEqual([]);
    expect(getState().settings.selectedModelId).toBeNull();
  });

  it('updates editor and settings state through the returned setters', async () => {
    await renderHarness();

    act(() => {
      getState().editor.setIsEditorOpen(true);
      getState().settings.setGlobalSystemPrompt('Updated system prompt');
      getState().settings.setSelectedModelId('model-1');
    });

    expect(getState().editor.isEditorOpen).toBe(true);
    expect(getState().settings.globalSystemPrompt).toBe('Updated system prompt');
    expect(getState().settings.selectedModelId).toBe('model-1');
  });
});
