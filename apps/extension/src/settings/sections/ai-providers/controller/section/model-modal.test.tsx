// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { AIModel } from '../../../../../contracts/settings';
import { useModelModalState } from './model-modal';

const MODEL: AIModel = {
  id: 'model-1',
  providerId: 'provider-1',
  modelCode: 'gpt-4.1',
  displayName: 'GPT 4.1',
  systemPrompt: '',
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useModelModalState> | null = null;

function Harness() {
  latestState = useModelModalState();
  return null;
}

async function render() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<Harness />);
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

it('opens and closes the model modal locally', async () => {
  await render();

  expect(latestState?.modelModal).toEqual({ open: false });

  act(() => {
    latestState?.openModelModal(MODEL);
  });

  expect(latestState?.modelModal).toEqual({ open: true, model: MODEL });

  act(() => {
    latestState?.closeModelModal();
  });

  expect(latestState?.modelModal).toEqual({ open: false });
});
