// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';

import { useAIModalPromptPersistenceEffect } from './prompt-persistence';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createPersistenceProps(
  overrides: Partial<Parameters<typeof useAIModalPromptPersistenceEffect>[0]> = {}
) {
  return {
    isOpen: true,
    prompt: '',
    setLastPrompt: vi.fn(),
    ...overrides,
  };
}

function PersistenceHarness(
  props: Omit<
    Parameters<typeof useAIModalPromptPersistenceEffect>[0],
    'bootedWhileOpenRef' | 'wasOpenRef'
  >
) {
  const wasOpenRef = useRef(false);
  const bootedWhileOpenRef = useRef(false);
  useAIModalPromptPersistenceEffect({ ...props, bootedWhileOpenRef, wasOpenRef });
  return null;
}

async function renderHarness(props: Parameters<typeof PersistenceHarness>[0]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<PersistenceHarness {...props} />);
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
  vi.unstubAllGlobals();
});

describe('useAIModalPromptPersistenceEffect', () => {
  it('persists the last prompt only after the modal closes from an open state', async () => {
    const props = createPersistenceProps();

    await renderHarness(props);
    await renderHarness({ ...props, isOpen: false, prompt: 'next prompt' });

    expect(props.setLastPrompt).toHaveBeenCalledWith('next prompt');
  });

  it('does not persist when the modal starts closed', async () => {
    const props = createPersistenceProps({ isOpen: false, prompt: 'ignored prompt' });

    await renderHarness(props);

    expect(props.setLastPrompt).not.toHaveBeenCalled();
  });
});
