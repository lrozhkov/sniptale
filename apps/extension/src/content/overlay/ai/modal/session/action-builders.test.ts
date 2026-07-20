import { describe, expect, it, vi } from 'vitest';

import {
  buildAIModalSelectionActions,
  buildTemplateEditorActions,
  buildTemplatePersistenceActions,
} from './action-builders';

function createBuilderProps() {
  return {
    addTemplate: vi.fn(async () => undefined),
    createModelSelectHandler: vi.fn(() => vi.fn()),
    createResizeStartHandler: vi.fn(() => vi.fn()),
    createTemplateAddHandler: vi.fn(() => vi.fn()),
    createTemplateDeleteHandler: vi.fn(() => vi.fn()),
    createTemplateEditHandler: vi.fn(() => vi.fn()),
    createTemplateSaveHandler: vi.fn(() => vi.fn()),
    createTemplateSelectHandler: vi.fn(() => vi.fn()),
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

describe('buildTemplateEditorActions', () => {
  it('binds editor mutation handlers to the current editor owner state', () => {
    const props = createBuilderProps();

    buildTemplateEditorActions(props);

    expect(props.createTemplateAddHandler).toHaveBeenCalledWith({
      setEditingTemplate: props.editor.setEditingTemplate,
      setIsEditorOpen: props.editor.setIsEditorOpen,
    });
    expect(props.createTemplateDeleteHandler).toHaveBeenCalledWith(props.removeTemplate);
    expect(props.createTemplateEditHandler).toHaveBeenCalledWith({
      setEditingTemplate: props.editor.setEditingTemplate,
      setIsEditorOpen: props.editor.setIsEditorOpen,
    });
  });
});

describe('buildAIModalSelectionActions', () => {
  it('binds selection handlers to the settings and resize owners', () => {
    const props = createBuilderProps();

    buildAIModalSelectionActions(props);

    expect(props.createModelSelectHandler).toHaveBeenCalledWith(props.settings.setSelectedModelId);
    expect(props.createResizeStartHandler).toHaveBeenCalledWith({
      setIsResizing: props.resize.setIsResizing,
      textareaRef: props.resize.textareaRef,
    });
  });
});

describe('buildTemplatePersistenceActions', () => {
  it('binds save/select handlers to template persistence and prompt owners', () => {
    const props = createBuilderProps();

    buildTemplatePersistenceActions(props);

    expect(props.createTemplateSaveHandler).toHaveBeenCalledWith({
      addTemplate: props.addTemplate,
      editingTemplate: props.editor.editingTemplate,
      updateTemplate: props.updateTemplate,
    });
    expect(props.createTemplateSelectHandler).toHaveBeenCalledWith({
      prompt: 'Prompt',
      selectTemplate: props.selectTemplate,
      setPrompt: props.setPrompt,
      textareaRef: props.resize.textareaRef,
    });
  });
});
