import { describe, expect, it, vi } from 'vitest';

import { buildAIModalState } from './view-state';

function createStateProps() {
  return {
    editor: {
      editingTemplate: undefined,
      isEditorOpen: false,
      setEditingTemplate: vi.fn(),
      setIsEditorOpen: vi.fn(),
    },
    handleAddTemplate: vi.fn(),
    handleDeleteTemplate: vi.fn(),
    handleEditTemplate: vi.fn(),
    handleModelSelect: vi.fn(),
    handleResizeStart: vi.fn(),
    handleSaveTemplate: vi.fn(),
    handleSelectTemplate: vi.fn(),
    prompt: 'Prompt',
    resize: {
      isResizing: false,
      resizerRef: { current: null },
      setIsResizing: vi.fn(),
      textareaRef: { current: null },
    },
    selectedData: 'Selected',
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
    setPrompt: vi.fn(),
    setSelectedData: vi.fn(),
    templateSubmitError: null,
    templates: [{ content: 'Template content', id: 'template-1', name: 'Template 1' }],
    templatesLoading: false,
    totalTokens: 13,
  };
}

describe('buildAIModalState', () => {
  it('projects owner-local state and handlers into the public AI modal surface', () => {
    const props = createStateProps();

    expect(buildAIModalState(props)).toEqual({
      availableModels: [],
      editingTemplate: undefined,
      handleAddTemplate: props.handleAddTemplate,
      handleDeleteTemplate: props.handleDeleteTemplate,
      handleEditTemplate: props.handleEditTemplate,
      handleModelSelect: props.handleModelSelect,
      handleResizeStart: props.handleResizeStart,
      handleSaveTemplate: props.handleSaveTemplate,
      handleSelectTemplate: props.handleSelectTemplate,
      isEditorOpen: false,
      isResizing: false,
      prompt: 'Prompt',
      providers: [],
      resizerRef: props.resize.resizerRef,
      selectedData: 'Selected',
      selectedModelId: null,
      setIsEditorOpen: props.editor.setIsEditorOpen,
      setPrompt: props.setPrompt,
      setSelectedData: props.setSelectedData,
      templateSubmitError: null,
      templates: [{ content: 'Template content', id: 'template-1', name: 'Template 1' }],
      templatesLoading: false,
      textareaRef: props.resize.textareaRef,
      totalTokens: 13,
    });
  });
});
