import { describe, expect, it, vi } from 'vitest';

import { buildAIModalState, createAIModalActionHandlers } from './build';

function createBuilderProps() {
  const handleAddTemplate = vi.fn();
  const handleDeleteTemplate = vi.fn();
  const handleEditTemplate = vi.fn();
  const handleModelSelect = vi.fn();
  const handleResizeStart = vi.fn();
  const handleSaveTemplate = vi.fn();
  const handleSelectTemplate = vi.fn();

  return {
    addTemplate: vi.fn(async () => undefined),
    createModelSelectHandler: vi.fn(() => handleModelSelect),
    createResizeStartHandler: vi.fn(() => handleResizeStart),
    createTemplateAddHandler: vi.fn(() => handleAddTemplate),
    createTemplateDeleteHandler: vi.fn(() => handleDeleteTemplate),
    createTemplateEditHandler: vi.fn(() => handleEditTemplate),
    createTemplateSaveHandler: vi.fn(() => handleSaveTemplate),
    createTemplateSelectHandler: vi.fn(() => handleSelectTemplate),
    editor: {
      editingTemplate: undefined,
      isEditorOpen: false,
      setEditingTemplate: vi.fn(),
      setIsEditorOpen: vi.fn(),
    },
    prompt: 'Prompt',
    removeTemplate: vi.fn(async () => undefined),
    resize: {
      isResizing: false,
      resizerRef: { current: null },
      setIsResizing: vi.fn(),
      textareaRef: { current: null },
    },
    selectTemplate: vi.fn(async () => 'Template content'),
    setPrompt: vi.fn(),
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
    updateTemplate: vi.fn(async () => undefined),
  };
}

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

describe('createAIModalActionHandlers', () => {
  it('merges editor, selection, and persistence action owners into one facade result', () => {
    const props = createBuilderProps();
    const expected = {
      handleAddTemplate: props.createTemplateAddHandler(),
      handleDeleteTemplate: props.createTemplateDeleteHandler(),
      handleEditTemplate: props.createTemplateEditHandler(),
      handleModelSelect: props.createModelSelectHandler(),
      handleResizeStart: props.createResizeStartHandler(),
      handleSaveTemplate: props.createTemplateSaveHandler(),
      handleSelectTemplate: props.createTemplateSelectHandler(),
    };

    expect(createAIModalActionHandlers(props)).toEqual(expected);
  });
});

describe('buildAIModalState facade', () => {
  it('keeps the public state projection contract stable through the thin facade', () => {
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
