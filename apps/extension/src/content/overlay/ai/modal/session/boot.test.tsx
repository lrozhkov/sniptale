// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RefObject } from 'react';

const { useAIModalOpenBootstrapEffectMock, useAIModalPromptPersistenceEffectMock } = vi.hoisted(
  () => ({
    useAIModalOpenBootstrapEffectMock: vi.fn(),
    useAIModalPromptPersistenceEffectMock: vi.fn(),
  })
);

vi.mock('./open', async () => {
  const actual = await vi.importActual<typeof import('./open')>('./open');

  return {
    ...actual,
    useAIModalOpenBootstrapEffect: useAIModalOpenBootstrapEffectMock,
  };
});

vi.mock('./prompt-persistence', async () => {
  const actual =
    await vi.importActual<typeof import('./prompt-persistence')>('./prompt-persistence');

  return {
    ...actual,
    useAIModalPromptPersistenceEffect: useAIModalPromptPersistenceEffectMock,
  };
});

import { useAIModalBootEffect } from './boot';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createBootProps(overrides: Partial<Parameters<typeof useAIModalBootEffect>[0]> = {}) {
  return {
    isOpen: true,
    lastPrompt: 'stored prompt',
    prompt: '',
    setAvailableModels: vi.fn(),
    setGlobalSystemPrompt: vi.fn(),
    setLastPrompt: vi.fn(),
    setPrompt: vi.fn(),
    setProviders: vi.fn(),
    setSelectedModelId: vi.fn(),
    textareaRef: { current: null } as RefObject<HTMLTextAreaElement | null>,
    ...overrides,
  };
}

function BootHarness(props: Parameters<typeof useAIModalBootEffect>[0]) {
  useAIModalBootEffect(props);
  return null;
}

async function renderHarness(props: Parameters<typeof useAIModalBootEffect>[0]) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<BootHarness {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useAIModalOpenBootstrapEffectMock.mockReset();
  useAIModalPromptPersistenceEffectMock.mockReset();
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

describe('useAIModalBootEffect', () => {
  it('delegates prompt persistence and open bootstrap to owner-local seams', async () => {
    const props = createBootProps();

    await renderHarness(props);

    expect(useAIModalPromptPersistenceEffectMock).toHaveBeenCalledTimes(1);
    expect(useAIModalPromptPersistenceEffectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isOpen: true,
        prompt: '',
        setLastPrompt: props.setLastPrompt,
      })
    );
    expect(useAIModalOpenBootstrapEffectMock).toHaveBeenCalledTimes(1);
    expect(useAIModalOpenBootstrapEffectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isOpen: true,
        lastPrompt: 'stored prompt',
        setAvailableModels: props.setAvailableModels,
        setGlobalSystemPrompt: props.setGlobalSystemPrompt,
        setPrompt: props.setPrompt,
        setProviders: props.setProviders,
        setSelectedModelId: props.setSelectedModelId,
        textareaRef: props.textareaRef,
      })
    );
  });
});
