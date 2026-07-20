import { describe, expect, it, vi } from 'vitest';

import { createAIModalViewStateArgs } from './view-props';

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

function createActions() {
  return {
    handleAddTemplate: vi.fn(),
    handleDeleteTemplate: vi.fn(),
    handleEditTemplate: vi.fn(),
    handleModelSelect: vi.fn(),
    handleResizeStart: vi.fn(),
    handleSaveTemplate: vi.fn(),
    handleSelectTemplate: vi.fn(),
  };
}

describe('createAIModalViewStateArgs', () => {
  it('projects controller state and owner-local actions into the public modal view state', () => {
    const core = createCoreState();
    const actions = createActions();

    expect(createAIModalViewStateArgs(core, actions)).toEqual({
      editor: core.editor,
      handleAddTemplate: actions.handleAddTemplate,
      handleDeleteTemplate: actions.handleDeleteTemplate,
      handleEditTemplate: actions.handleEditTemplate,
      handleModelSelect: actions.handleModelSelect,
      handleResizeStart: actions.handleResizeStart,
      handleSaveTemplate: actions.handleSaveTemplate,
      handleSelectTemplate: actions.handleSelectTemplate,
      prompt: 'Prompt',
      resize: core.resize,
      selectedData: 'Selected',
      setPrompt: core.setPrompt,
      setSelectedData: core.setSelectedData,
      settings: core.settings,
      templateSubmitError: null,
      templates: [{ content: 'Template content', id: 'template-1', name: 'Template 1' }],
      templatesLoading: false,
      totalTokens: 13,
    });
  });
});
