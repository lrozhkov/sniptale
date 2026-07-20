// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useAiProvidersDataState } from './data-state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useAiProvidersDataState> | null = null;

function Harness() {
  latestState = useAiProvidersDataState();
  return null;
}

async function render(node: React.ReactNode) {
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

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

it('creates the ai providers runtime data state with stable defaults', async () => {
  await render(<Harness />);

  expect(latestState).toMatchObject({
    chromeAiEnabled: false,
    defaultModelId: null,
    globalPrompt: '',
    isLoading: true,
    models: [],
    providers: [],
    scenarioEditorPrompt: '',
    selection: {
      models: [],
      providers: [],
    },
  });
  expect(latestState?.globalPromptRef.current).toBeNull();
  expect(latestState?.scenarioEditorPromptRef.current).toBeNull();
});

it('keeps setSelectionState stable across rerenders', async () => {
  await render(<Harness />);
  const firstSelectionSetter = latestState?.setSelectionState;

  await render(<Harness />);

  expect(latestState?.setSelectionState).toBe(firstSelectionSetter);
});
