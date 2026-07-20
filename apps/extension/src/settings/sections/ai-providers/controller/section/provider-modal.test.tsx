// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { AIProvider } from '../../../../../contracts/settings';
import { useProviderModalState } from './provider-modal';

const PROVIDER: AIProvider = {
  id: 'provider-1',
  name: 'OpenAI',
  connectionType: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  hasStoredApiKey: true,
  createdAt: 1,
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useProviderModalState> | null = null;

function Harness() {
  latestState = useProviderModalState();
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

it('opens and closes the provider modal locally', async () => {
  await render();

  expect(latestState?.providerModal).toEqual({ open: false });

  act(() => {
    latestState?.openProviderModal(PROVIDER);
  });

  expect(latestState?.providerModal).toEqual({ open: true, provider: PROVIDER });

  act(() => {
    latestState?.closeProviderModal();
  });

  expect(latestState?.providerModal).toEqual({ open: false });
});
