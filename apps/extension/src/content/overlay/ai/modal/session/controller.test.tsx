// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { buildAIModalStateMock, createAIModalActionHandlersMock, useAIModalBootEffectMock } =
  vi.hoisted(() => ({
    buildAIModalStateMock: vi.fn(),
    createAIModalActionHandlersMock: vi.fn(),
    useAIModalBootEffectMock: vi.fn(),
  }));

vi.mock('./boot', async () => {
  const actual = await vi.importActual<typeof import('./boot')>('./boot');

  return {
    ...actual,
    useAIModalBootEffect: useAIModalBootEffectMock,
  };
});

vi.mock('./build', async () => {
  const actual = await vi.importActual<typeof import('./build')>('./build');

  return {
    ...actual,
    buildAIModalState: buildAIModalStateMock,
    createAIModalActionHandlers: createAIModalActionHandlersMock,
  };
});

import { useAIModalControllerState } from './controller';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useAIModalControllerState> | null = null;

function createCoreState() {
  return {
    editor: {
      editingTemplate: undefined,
      isEditorOpen: false,
      setEditingTemplate: vi.fn(),
      setIsEditorOpen: vi.fn(),
    },
    lastPrompt: 'stored prompt',
    prompt: 'Prompt',
    resize: {
      isResizing: false,
      resizerRef: { current: null },
      setIsResizing: vi.fn(),
      textareaRef: { current: null },
    },
    selectedData: 'Selected',
    setLastPrompt: vi.fn(),
    setPrompt: vi.fn(),
    setSelectedData: vi.fn(),
    settings: {
      availableModels: [],
      globalSystemPrompt: '',
      providers: [],
      selectedModelId: null,
      setAvailableModels: vi.fn(),
      setGlobalSystemPrompt: vi.fn(),
      setProviders: vi.fn(),
      setSelectedModelId: vi.fn(),
    },
    templatesState: {
      addTemplate: vi.fn(async () => undefined),
      error: null,
      isLoading: false,
      isMutating: false,
      refreshTemplates: vi.fn(async () => undefined),
      removeTemplate: vi.fn(async () => undefined),
      selectTemplate: vi.fn(async () => 'Template content'),
      templates: [{ content: 'Template content', id: 'template-1', name: 'Template 1' }],
      updateTemplate: vi.fn(async () => undefined),
    },
    totalTokens: 13,
  };
}

function ControllerHarness() {
  latestState = useAIModalControllerState({
    core: createCoreState(),
    isOpen: true,
  });
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  createAIModalActionHandlersMock.mockReturnValue({
    handleAddTemplate: vi.fn(),
    handleDeleteTemplate: vi.fn(),
    handleEditTemplate: vi.fn(),
    handleModelSelect: vi.fn(),
    handleResizeStart: vi.fn(),
    handleSaveTemplate: vi.fn(),
    handleSelectTemplate: vi.fn(),
  });
  buildAIModalStateMock.mockImplementation((props) => props);

  await act(async () => {
    root?.render(<ControllerHarness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  buildAIModalStateMock.mockReset();
  createAIModalActionHandlersMock.mockReset();
  useAIModalBootEffectMock.mockReset();
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

describe('useAIModalControllerState', () => {
  it('delegates boot wiring and assembles the modal view state from owner-local builders', async () => {
    await renderHarness();

    expect(useAIModalBootEffectMock).toHaveBeenCalledTimes(1);
    expect(createAIModalActionHandlersMock).toHaveBeenCalledTimes(1);
    expect(buildAIModalStateMock).toHaveBeenCalledTimes(1);
    expect(latestState).toEqual(
      expect.objectContaining({
        prompt: 'Prompt',
        selectedData: 'Selected',
        templates: [{ content: 'Template content', id: 'template-1', name: 'Template 1' }],
        totalTokens: 13,
      })
    );
  });
});
