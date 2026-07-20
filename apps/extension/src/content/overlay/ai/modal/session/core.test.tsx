// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  estimateTokensMock,
  selectLastPromptMock,
  setLastPromptMock,
  useAIModalBootEffectMock,
  usePromptTemplatesMock,
} = vi.hoisted(() => ({
  estimateTokensMock: vi.fn((value: string) => value.length),
  selectLastPromptMock: vi.fn(),
  setLastPromptMock: vi.fn(),
  useAIModalBootEffectMock: vi.fn(),
  usePromptTemplatesMock: vi.fn(),
}));

vi.mock('../../../../parser/dom-tree-parser/ai/format', () => ({
  estimateTokens: estimateTokensMock,
}));

vi.mock('./prompt-template-state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./prompt-template-state')>()),
  usePromptTemplates: usePromptTemplatesMock,
}));

vi.mock('../../../state/ai-modal.store', () => ({
  selectLastPrompt: selectLastPromptMock,
  useAIModalStore: (
    selector: (state: { lastPrompt: string; setLastPrompt: typeof setLastPromptMock }) => unknown
  ) =>
    selector({
      lastPrompt: 'stored prompt',
      setLastPrompt: setLastPromptMock,
    }),
}));

vi.mock('./boot', async () => {
  const actual = await vi.importActual<typeof import('./boot')>('./boot');

  return {
    ...actual,
    useAIModalBootEffect: useAIModalBootEffectMock,
  };
});

import { useAIModalState } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useAIModalState> | null = null;

function AIModalStateHarness() {
  latestState = useAIModalState({ isOpen: true });
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  usePromptTemplatesMock.mockReturnValue({
    addTemplate: vi.fn(async () => undefined),
    error: null,
    isLoading: false,
    isMutating: false,
    refreshTemplates: vi.fn(async () => undefined),
    removeTemplate: vi.fn(async () => undefined),
    selectTemplate: vi.fn(async () => 'Template content'),
    templates: [{ content: 'Template content', id: 'template-1', name: 'Template 1' }],
    updateTemplate: vi.fn(async () => undefined),
  });

  await act(async () => {
    root?.render(<AIModalStateHarness />);
  });
}

function getState() {
  if (!latestState) {
    throw new Error('Expected AI modal state');
  }

  return latestState;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  estimateTokensMock.mockClear();
  selectLastPromptMock.mockImplementation((state: { lastPrompt: string }) => state.lastPrompt);
  setLastPromptMock.mockClear();
  useAIModalBootEffectMock.mockClear();
  usePromptTemplatesMock.mockReset();
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

describe('useAIModalState core', () => {
  it('assembles modal state from boot, settings, resize, and template seams', async () => {
    await renderHarness();

    expect(useAIModalBootEffectMock).toHaveBeenCalledTimes(1);
    expect(getState().templates).toHaveLength(1);
    expect(getState().templatesLoading).toBe(false);
    expect(getState().availableModels).toEqual([]);
    expect(getState().selectedModelId).toBeNull();
    expect(getState().totalTokens).toBe('stored prompt'.length);
  });

  it('recomputes total tokens when prompt or selected data changes', async () => {
    await renderHarness();

    act(() => {
      getState().setPrompt('prompt');
      getState().setSelectedData('json');
    });

    expect(getState().totalTokens).toBe(10);
    expect(estimateTokensMock).toHaveBeenNthCalledWith(4, 'prompt');
    expect(estimateTokensMock).toHaveBeenNthCalledWith(5, 'json');
    expect(estimateTokensMock).toHaveBeenNthCalledWith(6, '');
  });
});
