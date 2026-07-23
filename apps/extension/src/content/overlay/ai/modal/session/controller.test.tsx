// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  addTemplateMock,
  estimateTokensMock,
  removeTemplateMock,
  selectLastPromptMock,
  selectTemplateMock,
  setLastPromptMock,
  updateTemplateMock,
  useAIModalBootEffectMock,
  usePromptTemplatesMock,
} = vi.hoisted(() => ({
  addTemplateMock: vi.fn(async () => undefined),
  estimateTokensMock: vi.fn((value: string) => value.length),
  removeTemplateMock: vi.fn(async () => undefined),
  selectLastPromptMock: vi.fn(),
  selectTemplateMock: vi.fn(async () => 'Template content'),
  setLastPromptMock: vi.fn(),
  updateTemplateMock: vi.fn(async () => undefined),
  useAIModalBootEffectMock: vi.fn(),
  usePromptTemplatesMock: vi.fn(),
}));

vi.mock('../../../../parser/dom-tree-parser/ai/format', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../parser/dom-tree-parser/ai/format')>()),
  estimateTokens: estimateTokensMock,
}));

vi.mock(
  '../../../../../features/prompt-templates/hooks/use-prompt-templates',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../features/prompt-templates/hooks/use-prompt-templates')
    >()),
    usePromptTemplates: usePromptTemplatesMock,
  })
);

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
    addTemplate: addTemplateMock,
    error: null,
    isLoading: false,
    isMutating: false,
    refreshTemplates: vi.fn(async () => undefined),
    removeTemplate: removeTemplateMock,
    selectTemplate: selectTemplateMock,
    templates: [{ content: 'Template content', id: 'template-1', name: 'Template 1' }],
    updateTemplate: updateTemplateMock,
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
  addTemplateMock.mockClear();
  estimateTokensMock.mockClear();
  removeTemplateMock.mockClear();
  selectLastPromptMock.mockImplementation((state: { lastPrompt: string }) => state.lastPrompt);
  selectTemplateMock.mockClear();
  setLastPromptMock.mockClear();
  updateTemplateMock.mockClear();
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

describe('useAIModalState controller', () => {
  it('assembles the public state from the retained state, lifecycle, and template owners', async () => {
    await renderHarness();

    expect(useAIModalBootEffectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        isOpen: true,
        lastPrompt: 'stored prompt',
        prompt: 'stored prompt',
      })
    );
    expect(getState()).toEqual(
      expect.objectContaining({
        availableModels: [],
        prompt: 'stored prompt',
        selectedModelId: null,
        templateSubmitError: null,
        templates: [{ content: 'Template content', id: 'template-1', name: 'Template 1' }],
        templatesLoading: false,
        totalTokens: 'stored prompt'.length,
      })
    );
  });

  it('recomputes derived state when prompt or selected data changes', async () => {
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

  it('binds public actions directly to their state and persistence owners', async () => {
    await renderHarness();

    act(() => {
      getState().handleAddTemplate();
      getState().handleModelSelect('model-1');
    });

    expect(getState().isEditorOpen).toBe(true);
    expect(getState().selectedModelId).toBe('model-1');

    await act(async () => getState().handleSaveTemplate('Created', 'Body'));
    await act(async () => getState().handleDeleteTemplate({ id: 'template-1' }));

    expect(addTemplateMock).toHaveBeenCalledWith('Created', 'Body');
    expect(removeTemplateMock).toHaveBeenCalledWith('template-1');
  });
});
