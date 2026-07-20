// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { AIModel, AIProvider } from '../../../../../contracts/settings';
import { useDeleteState } from './delete-state';

const PROVIDER: AIProvider = {
  id: 'provider-1',
  name: 'OpenAI',
  connectionType: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  hasStoredApiKey: true,
  createdAt: 1,
};

const MODEL: AIModel = {
  id: 'model-1',
  providerId: 'provider-1',
  modelCode: 'gpt-4.1',
  displayName: 'GPT 4.1',
  systemPrompt: '',
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useDeleteState> | null = null;

function Harness() {
  latestState = useDeleteState();
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

it('tracks delete confirmation locally', async () => {
  await render();

  expect(latestState?.confirmDelete).toBeNull();

  act(() => {
    latestState?.setConfirmDelete({ type: 'provider', item: PROVIDER });
  });

  expect(latestState?.confirmDelete).toEqual({ type: 'provider', item: PROVIDER });

  act(() => {
    latestState?.setConfirmDelete({ type: 'model', item: MODEL });
  });

  expect(latestState?.confirmDelete).toEqual({ type: 'model', item: MODEL });

  act(() => {
    latestState?.setConfirmDelete(null);
  });

  expect(latestState?.confirmDelete).toBeNull();
});
