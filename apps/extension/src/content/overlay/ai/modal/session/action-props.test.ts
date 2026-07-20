import { describe, expect, it, vi } from 'vitest';

import { createAIModalActionHandlerArgs } from './action-props';
import {
  createModelSelectHandler,
  createResizeStartHandler,
  createTemplateAddHandler,
  createTemplateDeleteHandler,
  createTemplateEditHandler,
  createTemplateSaveHandler,
  createTemplateSelectHandler,
} from './actions';

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

describe('createAIModalActionHandlerArgs', () => {
  it('projects controller core state into the canonical action-handler contract', () => {
    const core = createCoreState();

    expect(createAIModalActionHandlerArgs(core)).toEqual({
      addTemplate: core.templatesState.addTemplate,
      createModelSelectHandler,
      createResizeStartHandler,
      createTemplateAddHandler,
      createTemplateDeleteHandler,
      createTemplateEditHandler,
      createTemplateSaveHandler,
      createTemplateSelectHandler,
      editor: core.editor,
      prompt: 'Prompt',
      removeTemplate: core.templatesState.removeTemplate,
      resize: core.resize,
      selectTemplate: core.templatesState.selectTemplate,
      setPrompt: core.setPrompt,
      settings: core.settings,
      updateTemplate: core.templatesState.updateTemplate,
    });
  });
});
